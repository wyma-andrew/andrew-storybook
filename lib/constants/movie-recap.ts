import { listVoices } from "../tts/voices";

export const MOVIE_RECAP_LANGUAGES = [{ id: "my", name: "Burmese" }] as const;
// The voices the Settings tab offers, taken from the TTS catalog so the picker
// and the synthesizer can never disagree about which voices exist.
export const MOVIE_RECAP_VOICES = listVoices("movie-recap");

export const MOVIE_RECAP_ASPECT_RATIOS = [
  { id: "9:16", name: "9:16" },
  { id: "16:9", name: "16:9" },
] as const;

export const MOVIE_RECAP_FIT_MODES = [
  { id: "cover", name: "Cover", description: "Fills the frame, cropping edges." },
  { id: "contain", name: "Contain", description: "Shows the full video, letterboxed." },
] as const;

// Subtitle look is a PRESET, not a set of knobs. A caption has one job — stay
// readable over moving footage — and the combinations that do that are few and
// known, so the wizard offers those instead of a colour list, a size slider and
// a shadow switch that can be arranged into unreadable output. These are DATA
// colors (they end up in the rendered video), not theme tokens.
//
// Both presets are a fill with a contrasting hard outline and NO background box.
// The outline is what carries them over a busy frame, so it is part of the
// preset rather than one colour shared by all of them — the two references this
// design matches invert each other.
export const MOVIE_RECAP_SUBTITLE_PRESETS = [
  {
    id: "yellow",
    name: "Yellow",
    // Sampled from the reference caption the product is matching — a lime-ish
    // yellow, not a softer gold.
    color: "#D9E824",
    outlineColor: "#000000",
    weight: 700,
    // Thick: measured off a TikTok recap caption, whose outline is 0.8x the
    // width of the glyph stems it surrounds (ours was 0.25-0.5x at 0.08). The
    // family and weight already matched — outline thickness was the whole
    // difference between the two looks.
    outlineEm: 0.14,
    description: "Lime yellow, black outline.",
  },
  {
    // Colour-neutral id on purpose: this look has been inverted three times
    // while its reference was being pinned down, and an id that names the fill
    // costs a migration every time. `mono` stays true whichever way round it is.
    id: "mono",
    name: "Black & white",
    color: "#000000",
    outlineColor: "#FFFFFF",
    // SemiBold (600). The weight was measured against a reference frame of this
    // look inverted (black on white); the still crop matched 500, and 600 ships
    // because the caption plays over moving footage rather than a frozen frame.
    // This is deliberately one step lighter than `yellow`, which is bold.
    weight: 600,
    // Same thick outline as `yellow` (0.8x the stem width): the two presets are
    // one look in two colours, so the outline weight that made yellow read right
    // applies here too.
    outlineEm: 0.14,
    description: "Black, thick white outline.",
  },
] as const;

// Caption size, as a percentage of FRAME HEIGHT, chosen per aspect ratio rather
// than by the user. The same percentage cannot serve both: the percentage is of
// HEIGHT, so 10% of a 720-tall landscape frame is 72px on a 1280-wide picture,
// while 10% of a 1280-tall portrait frame is 128px on one only 720 wide — more
// than twice the relative size.
//
// Both values come from one reference caption: measured on a portrait frame, its
// ink height was 51px on 1434, which is ~30px of font size (this font's ink runs
// about 1.68x the font size once Burmese marks stack above and below) — 3.6% of
// that frame's WIDTH. That rule is the starting point for a new aspect ratio,
// not the final answer: both values below were then judged against burned frames
// and moved, portrait up and landscape down. Burn a frame and look.
export const MOVIE_RECAP_SUBTITLE_SIZE_PCT = {
  // Landscape is watched further from the eye than a phone, so it reads smaller
  // than the width rule suggests. Stepped down against burned frames: 6.5%
  // (47px), 4.8% (35px) and 4% (29px) all read large. 3.4% is 24px, or 2% of
  // width.
  //
  // This is below the comfortable floor for Burmese at 720p: at this size the
  // marks stacked above and below a letter start closing into it, and the
  // outline (0.14em, ~3px here) does most of the separating. If it needs to go
  // smaller again, raise TARGET_DIMENSIONS to 1920x1080 instead — the same
  // relative size then has more pixels to draw with.
  "16:9": 3.4,
  // Portrait runs a little larger than the width rule alone gives (2.5 rather
  // than 2.0, i.e. 4.4% of width against 3.6%): a phone-sized frame is watched
  // at phone size, and the strict match read undersized on it.
  "9:16": 2.5,
} as const satisfies Record<string, number>;

// What keeps a caption legible over moving footage is the OUTLINE around each
// glyph: it works on a pale frame, a dark one, and on the boundary between them.
// An offset drop shadow does not — it darkens one side only, so the caption
// still dissolves into the frame on the other three.
//
// There is deliberately NO shadow alongside it. Burning both was tried against
// the reference caption this design matches: the offset copy reads as a grey
// ghost trailing every glyph and makes the outline look doubled. Outline alone
// is what the reference does.
//
// Outline thickness is per preset (`outlineEm` above), as a fraction of the
// subtitle font size: the two looks this design copies do not wear the same
// weight of outline. ASS `Outline` expands the glyph contour on every side; the
// CSS preview matches it with a stroke painted behind the fill.

// Font line box as a multiple of the CSS font size — Noto Sans Myanmar reserves
// 2.184em for stacked Burmese marks. It is also the ratio the ASS font size is
// inflated by (libass sizes by ascent+descent, CSS by em), which is why the
// preview sets line-height explicitly instead of leaving it to Tailwind.
export const MOVIE_RECAP_SUBTITLE_LINE_EM = 2.184;

export const MOVIE_RECAP_SUBTITLE_POSITIONS = [
  { id: "bottom", name: "Bottom" },
  { id: "middle", name: "Middle" },
  { id: "top", name: "Top" },
] as const;

// The copyright-free transform, applied per shot when a project has it on. Every
// value is deliberately mild: the point is that the export is not a frame-for-
// frame copy of the source, not that it looks processed.
//
// These live here rather than in the render so the numbers are readable in one
// place and can be shown in the UI later without importing the render.
export const MOVIE_RECAP_COPYRIGHT_TRANSFORM = {
  // Zoom is per project now (`copyrightZoom`), not a constant — see
  // MOVIE_RECAP_ZOOM below for the range and the recommendations.
  // eq: a nudge, not a look.
  contrast: 1.06,
  saturation: 1.08,
  gamma: 0.98,
  // Both ratios. It was landscape-only at first, following the original spec
  // where mirroring sat under the 16:9 rules; portrait was added once the
  // transform was running. The cost is the same either way: any text in frame —
  // signs, screens, captions already burned into the source — reads backwards.
  mirrorAspectRatios: ["16:9", "9:16"] as readonly string[],
  // Playback speeds a shot may run at, never 1.0. Duration matching used to
  // DERIVE the speed from how long a shot had to last, which left most shots at
  // the source's own speed; here the speed is chosen first and the length of
  // source taken absorbs it, so the output timing is unchanged.
  //
  // Kept inside +-7%: `setpts` resamples timestamps rather than frames, so at
  // 30fps a few percent is invisible, while past ~15% motion starts to read as
  // wrong. The 1.0 +-2% dead zone is skipped — too close to untouched to count.
  speeds: [0.94, 0.96, 1.05, 1.07] as readonly number[],
  // Letterbox fill: the same clip scaled to cover, blurred, and sat behind the
  // contained one, so the bars carry moving picture instead of black.
  backfillBlurRadius: 20,
  backfillBlurPasses: 2,
} as const;

// Zoom is a DIVISOR on the source crop (`crop = iw/zoom`), so 1 is no zoom and
// higher is tighter: 1.05 keeps the middle ~95% of the frame, 1.56 about 64%.
//
// The recommendations are seeded into the project when copyright-free is turned
// on, and depend on the fit mode rather than the aspect ratio. A project with the
// toggle off carries 1.
//
// Worth knowing when reading these numbers: a centre crop keeps the source's
// aspect ratio, so zoom does NOT shrink the letterbox bars on `contain` — it
// tightens the subject inside them.
export const MOVIE_RECAP_ZOOM = {
  min: 1,
  max: 2,
  step: 0.02,
  // Keyed by fit mode AND aspect ratio, because how much the frame can afford to
  // lose depends on both.
  recommended: {
    contain: {
      // Landscape contain holds a portrait source between wide blurred bars, and
      // that centre strip is already small — zooming it crops the subject
      // further while the bars stay exactly as wide, since a centre crop keeps
      // the source's aspect ratio.
      "16:9": 1,
      // Portrait contain has room to push in without losing anything visible.
      "9:16": 1.56,
    },
    cover: {
      // Landscape `cover` already crops a landscape source to fill; zooming on
      // top of that keeps taking from a frame that has nothing spare.
      "16:9": 1,
      // Portrait has width to give.
      "9:16": 1.05,
    },
  },
  // What a project carries when copyright-free is off.
  none: 1,
} as const satisfies {
  min: number;
  max: number;
  step: number;
  recommended: Record<string, Record<string, number>>;
  none: number;
};

export function recommendedMovieRecapZoom(fitMode: MovieRecapFitMode, aspectRatio: MovieRecapAspectRatio) {
  return MOVIE_RECAP_ZOOM.recommended[fitMode][aspectRatio];
}

// `copyrightZoom` is null when the user has not chosen one, which is not the same
// as choosing 1 (no zoom) — that distinction is why the column is nullable. Unset
// follows the recommendation for the current fit mode, so changing fit mode moves
// it, while a chosen value stays put.
export function effectiveMovieRecapZoom(project: {
  copyrightZoom: number | null;
  fitMode: MovieRecapFitMode;
  aspectRatio: MovieRecapAspectRatio;
}) {
  return project.copyrightZoom ?? recommendedMovieRecapZoom(project.fitMode, project.aspectRatio);
}

// Output frame size, shared by the ffmpeg render and anything in the UI that
// has to express a size in OUTPUT pixels (the blur radius below).
// Every segment is resampled to this before the parts are concatenated.
//
// Not cosmetic: `setpts` re-times frames without resampling them, so a shot
// played at 0.94 comes out with FEWER frames spread over the same slot (measured:
// 40 frames in 1.4s, an average 28.57fps). Concatenating that with a 30fps
// segment using `-c copy` holds single frames for two frame periods, which reads
// as a stutter — see history/movie-recap.md. Forcing one frame rate on every
// segment also makes `concat -c copy` correct for sources that are not 30fps to
// begin with.
export const MOVIE_RECAP_TARGET_FPS = 30;

export const MOVIE_RECAP_TARGET_DIMENSIONS = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
} as const satisfies Record<string, readonly [number, number]>;

// Region blur, in OUTPUT pixels: ffmpeg `boxblur=<radius>:<passes>`. The CSS
// preview cannot use these numbers directly — it draws a frame a few hundred
// pixels wide, so the same radius there would blur several times harder — and
// `backdrop-filter: blur()` is a gaussian, not a box blur. `movieRecapBlurCssPx`
// converts: N passes of a box blur of radius r approximate a gaussian of
// sigma = sqrt(N * ((2r+1)^2 - 1) / 12), which is then scaled by how small the
// preview frame is drawn.
export const MOVIE_RECAP_BLUR = { radius: 12, passes: 2 } as const;

export function movieRecapBlurCssPx(frameWidthPx: number, outputWidthPx: number) {
  const { radius, passes } = MOVIE_RECAP_BLUR;
  const sigma = Math.sqrt((passes * ((2 * radius + 1) ** 2 - 1)) / 12);
  return outputWidthPx > 0 ? (sigma * frameWidthPx) / outputWidthPx : sigma;
}

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
// Canned hook titles for a MOCK render, which never calls GPT — same contract
// as MOVIE_RECAP_MOCK_NARRATION above, so the Review panel can be checked
// without spending anything.
export const MOVIE_RECAP_MOCK_HOOK_TITLES = [
  "သူ့အတိတ်က ပြန်လိုက်လာပြီ",
  "တစ်ညတည်းနဲ့ ဘဝတစ်ခုလုံး ပြောင်းသွားတယ်",
  "ဒီလျှို့ဝှက်ချက်ကို ဘယ်သူမှ မသိခဲ့ဘူး",
  "မမျှော်လင့်တဲ့ တွေ့ဆုံမှုတစ်ခု",
  "အဖြေရှာဖို့ သူ ဘာတွေ ပေးဆပ်ခဲ့လဲ",
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
export type MovieRecapSubtitlePreset = (typeof MOVIE_RECAP_SUBTITLE_PRESETS)[number]["id"];

// The one place the preview and the render agree on what a caption looks like.
// Everything that used to be a per-project column — colour, size, weight,
// shadow — is resolved from the preset and the aspect ratio here, so the two
// renderers cannot drift apart.
export function movieRecapSubtitleStyle(project: {
  subtitlePreset: MovieRecapSubtitlePreset;
  aspectRatio: MovieRecapAspectRatio;
}) {
  const preset = MOVIE_RECAP_SUBTITLE_PRESETS.find((item) => item.id === project.subtitlePreset)
    ?? MOVIE_RECAP_SUBTITLE_PRESETS[0];
  return {
    color: preset.color,
    outlineColor: preset.outlineColor,
    outlineEm: preset.outlineEm,
    weight: preset.weight,
    // Percentage of frame height, the same number libass gets as `Fontsize`
    // against `PlayResY`.
    fontSizePct: MOVIE_RECAP_SUBTITLE_SIZE_PCT[project.aspectRatio],
  };
}

export function isMovieRecapSubtitlePreset(value: unknown): value is MovieRecapSubtitlePreset {
  return MOVIE_RECAP_SUBTITLE_PRESETS.some((item) => item.id === value);
}

export function isMovieRecapSubtitlePosition(value: unknown): value is MovieRecapSubtitlePosition {
  return MOVIE_RECAP_SUBTITLE_POSITIONS.some((item) => item.id === value);
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
