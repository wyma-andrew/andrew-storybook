import type { TtsSurface, Voice } from "./types";

// One catalog for every surface. An Azure voice's `previewUrl` points at a file
// generated from its own `sampleText` by scripts/generate-voice-previews.ts —
// change the line or the voice params and regenerate, or the button plays the
// old reading.
// A voice's id is what lands in the database
// (`movie_recap_projects.voice_profile_id`); the provider behind it is a code
// decision, so moving a voice to a different service later is an edit here and
// not a migration — same reasoning as visual styles living in lib/constants.
export const VOICES: readonly Voice[] = [
  {
    id: "azure-thiha",
    name: "Thiha",
    description: "Azure Burmese neural voice, male.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/azure-thiha.mp3",
    surfaces: ["movie-recap", "voice-lab"],
    providerId: "azure",
    params: { voiceName: "my-MM-ThihaNeural" },
  },
  {
    id: "azure-nilar",
    name: "Nilar",
    description: "Azure Burmese neural voice, female.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/azure-nilar.mp3",
    surfaces: ["movie-recap", "voice-lab"],
    providerId: "azure",
    params: { voiceName: "my-MM-NilarNeural" },
  },
  // Self-hosted, lab-only: kept out of Movie Recap while CPU inference takes
  // tens of seconds per clip (see history/voice-lab.md). Flip `surfaces` to add
  // either one back to the Settings tab.
  {
    id: "narrator",
    name: "Wai Yan",
    description: "Self-hosted VoxCPM2 voice with steady cinematic pacing.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A calm cinematic narrator with a clear mature voice and steady storytelling pace",
      seed: 20260915,
    },
  },
  {
    id: "narrator-female",
    name: "Yu Yu",
    description: "Self-hosted VoxCPM2 voice with a female timbre and steady cinematic pacing.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A calm cinematic female narrator with a clear mature voice and steady storytelling pace",
      seed: 20260916,
    },
  },
] as const;

// What a project falls back to. Also what the database column defaults to —
// keep the two in step.
export const DEFAULT_MOVIE_RECAP_VOICE_ID = "azure-thiha";

export function listVoices(surface: TtsSurface) {
  return VOICES.filter((voice) => voice.surfaces.includes(surface));
}

// Any voice in the catalog, whatever surface it belongs to — for the preview
// endpoint, which speaks a voice's own sample line and doesn't care where the
// voice is offered.
export function getVoiceById(id: unknown) {
  if (typeof id !== "string") return null;
  return VOICES.find((voice) => voice.id === id) ?? null;
}

export function getVoice(id: unknown, surface: TtsSurface) {
  if (typeof id !== "string") return null;
  return listVoices(surface).find((voice) => voice.id === id) ?? null;
}

// Resolving a stored project value, which can predate the current catalog:
// rows written before Azure carry `narrator`, a voice that is now lab-only.
// Those render in the default voice rather than failing a render outright.
export function resolveMovieRecapVoice(id: unknown) {
  return getVoice(id, "movie-recap") ?? getVoice(DEFAULT_MOVIE_RECAP_VOICE_ID, "movie-recap")!;
}
