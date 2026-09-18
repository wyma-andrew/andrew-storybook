import { getTtsProvider } from "./registry";
import { TtsError, type SynthesisRequest, type SynthesisResult } from "./types";

// The only call site anything outside lib/tts should need: hand it a voice and
// text, get audio back, without knowing who spoke it.
export async function synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
  const provider = getTtsProvider(request.voice.providerId);
  if (!provider.isConfigured()) {
    throw new TtsError(`The ${request.voice.providerId} voice service is not configured.`, 503);
  }
  return provider.synthesize(request);
}

export { TtsError };
export type { SynthesisResult };
