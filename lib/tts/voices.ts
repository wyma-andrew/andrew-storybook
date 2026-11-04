import type { TtsSurface, Voice } from "./types";

// One catalog for every surface. `previewUrl` is the fixed audio played by the
// profile's preview button; generated samples live alongside supplied refs.
// A voice's id is what lands in the database
// (`movie_recap_projects.voice_profile_id`); the provider behind it is a code
// decision, so moving a voice to a different service later is an edit here and
// not a migration — same reasoning as visual styles living in lib/constants.
// Both Azure voices speak at this rate. Azure's default reads slow for a recap,
// and the narration's pace is what makes a finished video drag.
//
// Shared rather than per-voice so the two cannot drift apart: a project that
// switches from Thiha to Nilar must not change length as a side effect, since
// every beat is sized from its synthesized clip.
//
// RAISING THIS CHANGES EVERY EXPORT, and it invalidates every cached clip —
// correctly, since they are recordings at the wrong speed (the rate is part of
// the narration cache key). It never drops narration WORDS; a faster read simply
// fits more of them under the same footage.
//
// +15% -> +20% on 2026-09-20, measured: the story ran 177.3s against 170.2s of
// film, and six of the seven blocks were within a couple of seconds of fitting.
// At +20% every one of those fits and only the block whose text is 37% longer
// than its timestamps is left, which no reading speed can rescue.
//
// After changing it: re-measure CHARS_PER_SECOND in lib/movie-recap-speech.ts
// (the method is written there), and run scripts/generate-voice-previews.ts —
// the previews are committed files and will otherwise play the old reading.
const AZURE_NARRATION_RATE = "+20%";

export const VOICES: readonly Voice[] = [
  {
    id: "azure-thiha",
    name: "Thiha",
    description: "Azure Burmese neural voice, male.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/azure-thiha.mp3",
    surfaces: ["movie-recap", "voice-lab"],
    providerId: "azure",
    params: { voiceName: "my-MM-ThihaNeural", rate: AZURE_NARRATION_RATE },
  },
  {
    id: "azure-nilar",
    name: "Nilar",
    description: "Azure Burmese neural voice, female.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/azure-nilar.mp3",
    surfaces: ["movie-recap", "voice-lab"],
    providerId: "azure",
    params: { voiceName: "my-MM-NilarNeural", rate: AZURE_NARRATION_RATE },
  },
  {
    id: "wise-elder",
    name: "ပညာရှိအဘိုး",
    description: "ဘုရားဇာတ်လမ်းများအတွက် အသံထူပြီး ဖြည်းဖြည်းတည်ငြိမ်စွာ ဇာတ်ကြောင်းပြောသော VoxCPM2 အသံ။",
    sampleText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "An elderly Burmese storyteller with a rich low baritone voice, calm and dignified, speaking at an unhurried pace with natural phrasing and quiet authority",
      seed: 20261011,
      referenceAudioId: "wise-elder",
      referenceAudioHash: "e0c831e2ca8929e34d5e507358817c98d361fb30c8c106a6db73535759ae0c75",
      referenceText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    },
  },
  {
    id: "grandpa",
    name: "Grandpa",
    description: "မြေးကို ပုံပြင်ပြောပြသော အဘိုးအိုအသံ၊ VoxCPM2။",
    sampleText: "ဟိုး.. ရှေးရှေးတုန်းက မြတ်စွာဘုရားရှင် လူ့ပြည်ကိုပြန်ကြွလာတာကို ကြိုဆိုခဲ့ကြရာကနေစတာကွဲ့ အဖိုးပြောပြမယ်နားထောင်",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "An old Burmese grandfather telling a story to his grandson, warm and affectionate, unhurried",
      seed: 20261025,
      referenceAudioId: "grandpa",
      referenceAudioHash: "5b6b2110b4182d0cbbe456b705d1cfd03f626aca20b6f405a6dcfeab77f9ad2c",
      referenceText: "ဟိုး.. ရှေးရှေးတုန်းက မြတ်စွာဘုရားရှင် လူ့ပြည်ကိုပြန်ကြွလာတာကို ကြိုဆိုခဲ့ကြရာကနေစတာကွဲ့ အဖိုးပြောပြမယ်နားထောင်",
    },
  },
  {
    id: "dhamma-1",
    name: "ဓမ္မသံ ၁",
    description: "ဘုရားဇာတ်လမ်းများအတွက် အသံထူထူ၊ တည်ကြည်သော VoxCPM2 အသံ။",
    sampleText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A mature Burmese male storyteller with a naturally deep resonant baritone voice, solemn and composed, speaking with a smooth natural Burmese storytelling rhythm, gentle phrase pauses, and clear pronunciation",
      seed: 20261011,
      referenceAudioId: "dhamma-1",
      referenceAudioHash: "944ac0d8677e795aca0f8c5c9e471b99d52c0badfd0f3ba44478afb3241c3e2e",
      referenceText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    },
  },
  {
    id: "dhamma-3",
    name: "ဓမ္မသံ ၃",
    description: "ဘုရားဇာတ်လမ်းများအတွက် လေးနက်တည်ငြိမ်သော VoxCPM2 အသံ။",
    sampleText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    previewUrl: null,
    surfaces: ["voice-lab"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A mature Burmese male storyteller with a very deep full-bodied resonant baritone voice and rich chest resonance, solemn and composed, slow deliberate pacing, clear articulation, and gentle warmth",
      seed: 20261012,
      referenceAudioId: "dhamma-3",
      referenceAudioHash: "68354c69d94c1b121a7546e6e0b21b804de94f00f9eb34ff0188d2a5cf110384",
      referenceText: "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။",
    },
  },
  // Shared across the lab and Movie Recap; provider-specific settings remain
  // here so both surfaces synthesize the same profile.
  {
    id: "narrator",
    name: "Wai Yan",
    description: "VoxCPM2 voice based on Wai Yan's reference recording.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/waiyan-reference.wav",
    surfaces: ["voice-lab", "movie-recap"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A calm cinematic narrator with a clear mature voice and steady storytelling pace",
      seed: 20260915,
      referenceAudioId: "waiyan",
      referenceAudioHash: "77fa241a844eca60cdbeaefd19a28871d0cbe4231c1f2a0b5c71c29f9ae20866",
      referenceText: "မင်္ဂလာပါ ကိုအောင်ဇော်မျိုးခင်ဗျ ဘယ်တွေသွားနေတာပါလဲ",
    },
  },
  {
    id: "narrator-female",
    name: "Yuzana",
    description: "VoxCPM2 voice based on Yuzana's reference recording.",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
    previewUrl: "/movie-recap/voices/yuzana-reference.wav",
    surfaces: ["voice-lab", "movie-recap"],
    providerId: "voxcpm",
    params: {
      stylePrompt: "A calm cinematic female narrator with a clear mature voice and steady storytelling pace",
      seed: 20260916,
      referenceAudioId: "yuzana",
      referenceAudioHash: "59a06d1bac9788a5aeeb0e1101de45410b4f34340060aaeb9d7f095a6210892d",
      referenceText: "မင်္ဂလာပါ ကျမ ယုဇနပါ",
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

// Unknown stored values fall back to the default so older projects still render.
export function resolveMovieRecapVoice(id: unknown) {
  return getVoice(id, "movie-recap") ?? getVoice(DEFAULT_MOVIE_RECAP_VOICE_ID, "movie-recap")!;
}
