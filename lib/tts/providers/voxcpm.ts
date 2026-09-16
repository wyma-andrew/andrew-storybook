import { voiceWorkerHeaders, voiceWorkerSignal, voiceWorkerUrl } from "../../voice-worker";
import { TtsError, type SynthesisRequest, type SynthesisResult, type TtsProvider } from "../types";

// The self-hosted VoxCPM2 worker behind VOICE_LAB_WORKER_URL. It stays a
// first-class provider even though Movie Recap ships Azure voices, because the
// point of the lab is comparing our own service against the paid one.
export const voxcpmProvider: TtsProvider = {
  id: "voxcpm",

  isConfigured() {
    return Boolean(voiceWorkerUrl("generate"));
  },

  async synthesize({ text, voice, signal }: SynthesisRequest): Promise<SynthesisResult> {
    if (voice.providerId !== "voxcpm") throw new TtsError("The voice worker cannot speak this voice profile.", 500);
    const url = voiceWorkerUrl("generate");
    if (!url) throw new TtsError("Voice worker is not configured. Set VOICE_LAB_WORKER_URL first.", 503);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: voiceWorkerHeaders(),
        body: JSON.stringify({
          text: text.trim(),
          stylePrompt: voice.params.stylePrompt,
          seed: voice.params.seed,
        }),
        cache: "no-store",
        signal: signal ?? voiceWorkerSignal(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new TtsError(timedOut ? "Voice generation timed out." : "Could not reach the voice worker.", 502);
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new TtsError(
        typeof result?.detail === "string" ? result.detail : `Voice worker returned ${response.status}.`,
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }
    if (
      typeof result?.audioBase64 !== "string" ||
      typeof result?.durationSeconds !== "number" ||
      typeof result?.sampleRate !== "number"
    ) {
      throw new TtsError("Voice worker returned an invalid audio response.", 502);
    }

    return {
      audio: Buffer.from(result.audioBase64, "base64"),
      durationSeconds: result.durationSeconds,
      sampleRate: result.sampleRate,
      format: "wav",
    };
  },
};
