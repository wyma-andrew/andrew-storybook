import { buildSsml } from "../ssml";
import { TtsError, type SynthesisRequest, type SynthesisResult, type TtsProvider } from "../types";
import { wavInfo } from "../wav";

// 24kHz 16-bit mono PCM in a RIFF container: WAV so the duration is readable
// from the header with no decode step, mono because the render mixes one
// narration track, and 24kHz because Azure's higher rates cost bytes the
// final AAC mux throws away anyway.
const OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm";
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
// The free (F0) tier allows 20 synthesis requests per 60 seconds and cannot be
// raised, and a render synthesizes one request per narration beat back to back —
// a recap of any length WILL cross that line. A 429 is therefore an expected
// part of normal operation here, not an error, so it is waited out rather than
// failed. Azure's own guidance is to retry 429 with backoff; it also returns
// 429 when its backend is scaling, which S0 hits too.
const RATE_LIMIT_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY_MS = 5_000;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function endpoint() {
  const region = process.env.TTS_AZURE_REGION?.trim();
  if (!region) return null;
  // A custom endpoint wins when set (private/regional deployments); otherwise
  // the standard per-region host.
  const custom = process.env.TTS_AZURE_ENDPOINT?.trim();
  if (custom) return custom.replace(/\/$/, "");
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export const azureProvider: TtsProvider = {
  id: "azure",

  isConfigured() {
    return Boolean(process.env.TTS_AZURE_KEY?.trim() && endpoint());
  },

  async synthesize({ text, voice, signal }: SynthesisRequest): Promise<SynthesisResult> {
    if (voice.providerId !== "azure") throw new TtsError("Azure cannot speak this voice profile.", 500);
    const key = process.env.TTS_AZURE_KEY?.trim();
    const url = endpoint();
    if (!key || !url) {
      throw new TtsError("Azure Speech is not configured. Set TTS_AZURE_KEY and TTS_AZURE_REGION first.", 503);
    }

    const body = buildSsml(voice.params, text);

    let response: Response | null = null;
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            // charset matters: the narration is Burmese, so the body is
            // multi-byte UTF-8.
            "Content-Type": "application/ssml+xml; charset=utf-8",
            "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
            "User-Agent": "ai-storybook",
          },
          body,
          cache: "no-store",
          // The caller's own signal (render cancel) still wins; this only bounds
          // a request Azure never answers.
          signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
        throw new TtsError("Could not reach Azure Speech.", 502);
      }

      if (response.status !== 429 || attempt === RATE_LIMIT_RETRIES) break;
      // Azure sends Retry-After on a quota 429; without it, back off linearly
      // toward the length of the free tier's own 60-second window.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RATE_LIMIT_BASE_DELAY_MS * (attempt + 1);
      console.warn(`[tts:azure] rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${RATE_LIMIT_RETRIES}).`);
      await sleep(waitMs, signal);
    }

    if (!response) throw new TtsError("Could not reach Azure Speech.", 502);

    if (!response.ok) {
      // 401/403 is a bad key and 429 here means the retries above ran out —
      // both are passed through so the caller doesn't treat them as a generic
      // upstream fault.
      const detail = await response.text().catch(() => "");
      const status = response.status === 401 || response.status === 403 || response.status === 429 ? response.status : 502;
      const hint = response.status === 429 ? " The free (F0) tier allows 20 requests per minute." : "";
      throw new TtsError(`Azure Speech returned ${response.status}.${hint}${detail ? ` ${detail.slice(0, 200)}` : ""}`, status);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    const info = wavInfo(audio);
    if (!info) throw new TtsError("Azure Speech returned audio that could not be read.", 502);

    return { audio, durationSeconds: info.durationSeconds, sampleRate: info.sampleRate, format: "wav" };
  },
};
