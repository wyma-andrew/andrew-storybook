import { voiceWorkerHeaders, voiceWorkerSignal, voiceWorkerUrl } from "../../voice-worker";
import { TtsError, type SynthesisRequest, type SynthesisResult, type TtsProvider } from "../types";

// The self-hosted VoxCPM2 worker behind VOICE_LAB_WORKER_URL, shared by the
// Voice Lab and Movie Recap profiles that select this provider.
const VOXCPM_ATTEMPTS = 3;

export const voxcpmProvider: TtsProvider = {
  id: "voxcpm",

  isConfigured() {
    return Boolean(voiceWorkerUrl("generate"));
  },

  async synthesize({ text, voice, signal }: SynthesisRequest): Promise<SynthesisResult> {
    if (voice.providerId !== "voxcpm") throw new TtsError("The voice worker cannot speak this voice profile.", 500);
    const url = voiceWorkerUrl("generate");
    if (!url) throw new TtsError("Voice worker is not configured. Set VOICE_LAB_WORKER_URL first.", 503);

    const body = JSON.stringify({
      text: text.trim(),
      stylePrompt: voice.params.stylePrompt,
      seed: voice.params.seed,
      referenceAudioId: voice.params.referenceAudioId,
      referenceText: voice.params.referenceText,
    });
    const requestSignal = signal ?? voiceWorkerSignal();

    // Modal can preempt a GPU container mid-request; the caller then sees a bare
    // 5xx or a dropped connection, and the same request succeeds on the next
    // container. Generation is seeded, so retrying is safe. 4xx and aborts are
    // not retried. See history/voice-lab.md 2026-11-11.
    let result: Record<string, unknown> | null = null;
    for (let attempt = 1; ; attempt++) {
      let response: Response | null = null;
      let failure: TtsError | null = null;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: voiceWorkerHeaders(),
          body,
          cache: "no-store",
          signal: requestSignal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        if (timedOut) throw new TtsError("Voice generation timed out.", 502);
        failure = new TtsError("Could not reach the voice worker.", 502);
      }

      if (response) {
        result = await response.json().catch(() => null);
        if (response.ok) break;
        const message = typeof result?.detail === "string" ? result.detail : `Voice worker returned ${response.status}.`;
        if (response.status < 500) throw new TtsError(message, response.status);
        failure = new TtsError(message, 502);
      }

      if (attempt >= VOXCPM_ATTEMPTS || requestSignal.aborted) throw failure!;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }

    if (
      typeof result?.audioBase64 !== "string" ||
      typeof result?.durationSeconds !== "number" ||
      typeof result?.sampleRate !== "number"
    ) {
      throw new TtsError("Voice worker returned an invalid audio response.", 502);
    }

    return {
      audio: Buffer.from(result.audioBase64 as string, "base64"),
      durationSeconds: result.durationSeconds,
      sampleRate: result.sampleRate,
      format: "wav",
    };
  },
};
