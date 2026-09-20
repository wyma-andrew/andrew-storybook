// The surfaces that offer a voice. A voice can be available in the lab while
// staying out of Movie Recap's Settings tab — the lab exists to evaluate
// providers that are not production choices yet (see history/voice-lab.md).
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
};

type VoiceBase = {
  id: string;
  name: string;
  description: string;
  // Burmese line shown next to the voice in the picker, and spoken by its
  // preview clip when one exists.
  sampleText: string;
  // A pregenerated clip in `public/`, or null when no sample has been recorded
  // for this voice yet — the picker hides its play button rather than playing
  // some other voice's clip.
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
