export const MOVIE_RECAP_LANGUAGES = [{ id: "my", name: "Burmese" }] as const;
export const MOVIE_RECAP_VOICES = [
  {
    id: "narrator",
    name: "Narrator",
    previewUrl: "/movie-recap/voices/narrator.mp3",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
  },
] as const;

export const MOVIE_RECAP_ASPECT_RATIOS = [
  { id: "9:16", name: "Vertical 9:16" },
  { id: "16:9", name: "Landscape 16:9" },
] as const;

export const MOVIE_RECAP_FIT_MODES = [
  { id: "cover", name: "Cover", description: "Fills the frame, cropping edges." },
  { id: "contain", name: "Contain", description: "Shows the full video, letterboxed." },
] as const;

// Subtitle look. These are DATA colors chosen per project (they end up in the
// rendered video), not theme tokens — the "no raw colors in JSX" rule is about
// the app's own chrome, which still uses tokens everywhere around this.
export const MOVIE_RECAP_SUBTITLE_COLORS = [
  { id: "#FFFFFF", name: "White" },
  { id: "#FFE066", name: "Yellow" },
  { id: "#111111", name: "Black" },
] as const;

export const MOVIE_RECAP_SUBTITLE_BG_COLORS = [
  { id: "#000000", name: "Black" },
  { id: "#1D4ED8", name: "Blue" },
  { id: "#FFFFFF", name: "White" },
] as const;

export const MOVIE_RECAP_SUBTITLE_POSITIONS = [
  { id: "bottom", name: "Bottom" },
  { id: "middle", name: "Middle" },
  { id: "top", name: "Top" },
] as const;

// Logo geometry is shared by the CSS preview and the ffmpeg overlay so the two
// can't drift — the render used to scale to 18% width with no height cap while
// the preview also capped height, making rendered logos larger than previewed.
export const MOVIE_RECAP_LOGO_BOX = { widthPct: 18, heightPct: 12, marginPct: 4 } as const;

// The stand-in caption the step-3 preview draws. It is also the mock render's
// first line, so a mock render puts the EXACT same words on screen as the
// preview — the only honest way to compare the two designs.
export const MOVIE_RECAP_SUBTITLE_SAMPLE = "ဒီဇာတ်လမ်းရဲ့ စာတန်းထိုးက ဒီနေရာမှာ ပေါ်ပါမယ်။";

// Canned narration for the mock render: no Whisper, no GPT, no API spend —
// used to iterate on overlay/subtitle design without paying per attempt. Each
// line is already one caption, so the mock path does not split them.
export const MOVIE_RECAP_MOCK_NARRATION = [
  MOVIE_RECAP_SUBTITLE_SAMPLE,
  "ဒီဇာတ်လမ်းဟာ မြို့ကြီးတစ်ခုရဲ့ ညဘက်မှာ စတင်ပါတယ်။",
  "ဇာတ်ကောင်ဟာ မိမိရဲ့ အတိတ်ကို ပြန်လည်ရင်ဆိုင်ရတော့မယ်။",
  "မမျှော်လင့်ဘဲ တွေ့ဆုံမှုတစ်ခုက အရာအားလုံးကို ပြောင်းလဲစေတယ်။",
  "လျှို့ဝှက်ချက်တွေ တစ်ခုပြီးတစ်ခု ပေါ်ထွက်လာပါတယ်။",
  "နောက်ဆုံးမှာတော့ သူဟာ အဖြေတစ်ခုကို ရှာတွေ့ခဲ့ပါတယ်။",
] as const;
// Only this much of the source is used for a mock render — it exists to check
// framing, logo, and subtitle design quickly, not to preview the whole movie.
export const MOVIE_RECAP_MOCK_SOURCE_SECONDS = 40;

export const MOVIE_RECAP_LOGO_PLACEMENTS = [
  { id: "top_left", name: "Top left" },
  { id: "top_right", name: "Top right" },
  { id: "bottom_left", name: "Bottom left" },
  { id: "bottom_right", name: "Bottom right" },
] as const;

export type MovieRecapLanguage = (typeof MOVIE_RECAP_LANGUAGES)[number]["id"];
export type MovieRecapVoiceId = (typeof MOVIE_RECAP_VOICES)[number]["id"];
export type MovieRecapAspectRatio = (typeof MOVIE_RECAP_ASPECT_RATIOS)[number]["id"];
export type MovieRecapFitMode = (typeof MOVIE_RECAP_FIT_MODES)[number]["id"];
export type MovieRecapLogoPlacement = (typeof MOVIE_RECAP_LOGO_PLACEMENTS)[number]["id"];
export type MovieRecapSubtitlePosition = (typeof MOVIE_RECAP_SUBTITLE_POSITIONS)[number]["id"];

export function isMovieRecapSubtitlePosition(value: unknown): value is MovieRecapSubtitlePosition {
  return MOVIE_RECAP_SUBTITLE_POSITIONS.some((item) => item.id === value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isMovieRecapAspectRatio(value: unknown): value is MovieRecapAspectRatio {
  return MOVIE_RECAP_ASPECT_RATIOS.some((item) => item.id === value);
}

export function isMovieRecapFitMode(value: unknown): value is MovieRecapFitMode {
  return MOVIE_RECAP_FIT_MODES.some((item) => item.id === value);
}

export function isMovieRecapLogoPlacement(value: unknown): value is MovieRecapLogoPlacement {
  return MOVIE_RECAP_LOGO_PLACEMENTS.some((item) => item.id === value);
}
