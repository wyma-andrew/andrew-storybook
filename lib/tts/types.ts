// The surfaces that offer a voice. Profiles can be shared across the lab and
// production flows while retaining one provider configuration in the catalog.
export type TtsSurface = "movie-recap" | "voice-lab";

export type AzureVoiceParams = {
  // Azure's own short name, e.g. "my-MM-ThihaNeural".
  voiceName: string;
  // SSML prosody values, passed through verbatim when set.
  rate?: string;
  pitch?: string;
};

export type VoxcpmVoiceParams = {
  stylePrompt: string;
  seed: number;
  referenceAudioId?: "waiyan" | "yuzana";
  referenceAudioHash?: string;
  referenceText?: string;
};

type VoiceBase = {
  id: string;
  name: string;
  description: string;
  // Burmese text used when this profile synthesizes new audio.
  sampleText: string;
  // Static audio played by the profile preview button, or null if unavailable.
  previewUrl: string | null;
  surfaces: readonly TtsSurface[];
};

// Provider-specific settings stay inside the provider's own params object: a
// voice-design prompt and seed mean nothing to Azure, and an SSML rate means
// nothing to VoxCPM2. Adding a provider adds a member here, and the compiler
// then points at every place that has to handle it.
export type Voice =
  | (VoiceBase & { providerId: "azure"; params: AzureVoiceParams })
  | (VoiceBase & { providerId: "voxcpm"; params: VoxcpmVoiceParams });

export type ProviderId = Voice["providerId"];

export type SynthesisRequest = {
  text: string;
  voice: Voice;
  /**
   * Overrides the voice's own SSML rate for this one clip. Movie Recap uses it
   * to land a beat on its footage exactly (lib/movie-recap-narration-rate.ts);
   * a provider with no notion of rate ignores it.
   */
  rate?: string;
  signal?: AbortSignal;
};

export type SynthesisResult = {
  audio: Buffer;
  // MEASURED, not estimated. The render pipeline's duration matching targets
  // this instead of a character-count guess (see history/movie-recap.md).
  durationSeconds: number;
  sampleRate: number;
  format: "wav";
};

export interface TtsProvider {
  id: ProviderId;
  // Whether the env this provider needs is present. Callers turn a false here
  // into a 503 with a specific message, not a generic failure.
  isConfigured(): boolean;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TtsError";
  }
}
