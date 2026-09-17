import { listVoices } from "../tts/voices";
// Type-only, so it is erased at build time and creates no import cycle with
// api/types.ts, which imports the value types from this file.
import type { MovieRecapRenderStage } from "../api/types";

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
  // wrong. The 1.0 +-3% dead zone is skipped — too close to untouched to count.
  //
  // SLOW-ONLY. The set used to run both ways (0.96, 0.97, 1.04, 1.07); nothing
  // is sped up now. A fast shot fights the pacing, and a slow one consumes
  // `slot * speed` LESS source than its slot, so it runs less far into the
  // footage after it and the continuity invariant has more room. 0.94 is left
  // out — at 6% it is the one value that reads as deliberate slow motion, and
  // in a slow-only set it would land on a third of the shots.
  speeds: [0.95, 0.96, 0.97] as readonly number[],
  // Letterbox fill: the same clip scaled to cover, blurred, and sat behind the
  // contained one, so the bars carry moving picture instead of black.
  // At BLUR_REFERENCE_WIDTH, like MOVIE_RECAP_BLUR.radius — scaled per output.
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
// The render's stages, grouped into the steps the Review tab shows as a
// progress bar.
//
// Grouped rather than listed one-per-stage for two reasons, both of which would
// otherwise put steps on screen that never happen:
//   - `reading_captions` and `extracting_audio`/`transcribing` are alternatives,
//     not a sequence. A source with subtitles never transcribes, and one without
//     never reads captions. As one "Dialogue" step, either path fills it.
//   - thirteen stages is a wall of text, not a progress bar.
//
// The ORDER here is the order the render runs them in, and it is what decides
// which steps are already done — so a stage added to the pipeline must be added
// to the right group here, or it will read as "not started" while it runs.
export const MOVIE_RECAP_RENDER_STEPS = [
  { id: "download", label: "Source", stages: ["downloading_source"] },
  { id: "scenes", label: "Scenes", stages: ["detecting_scenes", "describing_scenes"] },
  { id: "dialogue", label: "Dialogue", stages: ["reading_captions", "extracting_audio", "transcribing"] },
  { id: "script", label: "Script", stages: ["writing_script"] },
  { id: "narration", label: "Narration", stages: ["synthesizing_narration"] },
  { id: "video", label: "Video", stages: ["rendering_segments", "concatenating", "applying_overlays"] },
  { id: "publish", label: "Publish", stages: ["uploading"] },
] as const satisfies readonly { id: string; label: string; stages: readonly MovieRecapRenderStage[] }[];

// A mock render produces its narration from canned text and never touches the
// source's pictures, audio or any model, so these steps genuinely do not run.
// They are shown as skipped rather than done — claiming a mock "transcribed the
// dialogue" would be a lie told by a progress bar.
export const MOVIE_RECAP_MOCK_SKIPPED_STEPS = ["download", "scenes", "dialogue", "script", "narration"] as const;

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
  // Still 720p. Long form has never been rendered at length and is a draft
  // config; raise it when it is actually being published to YouTube.
  "16:9": [1280, 720],
  // 1080x1920, raised from 720x1280 once reels were being published rather than
  // test-rendered. TikTok, Facebook and Reels all re-encode whatever they are
  // given, so handing them a 720-wide source means their compression starts
  // from an already-soft picture — worst on the burned Burmese captions, whose
  // stacked marks are the first thing to go.
  "9:16": [1080, 1920],
} as const satisfies Record<string, readonly [number, number]>;

// The widths the pixel-valued blur radii below were chosen against — PER RATIO,
// because they were tuned on the frame each ratio had at the time, not on a
// shared one.
//
// Every other size in the pipeline is a percentage of the frame, so raising a
// resolution changes nothing. These two are the exception: a fixed pixel radius
// blurs relatively LESS on a bigger frame, so a region blur that hid a watermark
// at 720 would stop hiding it at 1080. That is a correctness bug, not a
// cosmetic one — which is why this scales rather than staying constant.
//
// Anchoring per ratio is what keeps 16:9 byte-identical while 9:16 moves.
const BLUR_REFERENCE_WIDTH = {
  "16:9": 1280,
  "9:16": 720,
} as const satisfies Record<MovieRecapAspectRatio, number>;

export function movieRecapBlurRadius(baseRadius: number, aspectRatio: MovieRecapAspectRatio) {
  const width = MOVIE_RECAP_TARGET_DIMENSIONS[aspectRatio][0];
  return Math.max(1, Math.round((baseRadius * width) / BLUR_REFERENCE_WIDTH[aspectRatio]));
}

// Region blur, in OUTPUT pixels: ffmpeg `boxblur=<radius>:<passes>`. The CSS
// preview cannot use these numbers directly — it draws a frame a few hundred
// pixels wide, so the same radius there would blur several times harder — and
// `backdrop-filter: blur()` is a gaussian, not a box blur. `movieRecapBlurCssPx`
// converts: N passes of a box blur of radius r approximate a gaussian of
// sigma = sqrt(N * ((2r+1)^2 - 1) / 12), which is then scaled by how small the
// preview frame is drawn.
// `radius` is the value AT BLUR_REFERENCE_WIDTH; the render scales it with
// `movieRecapBlurRadius`.
export const MOVIE_RECAP_BLUR = { radius: 12, passes: 2 } as const;

export function movieRecapBlurCssPx(frameWidthPx: number, aspectRatio: MovieRecapAspectRatio) {
  const { passes } = MOVIE_RECAP_BLUR;
  const outputWidthPx = MOVIE_RECAP_TARGET_DIMENSIONS[aspectRatio][0];
  // The preview converts from the radius the RENDER will actually use, not the
  // reference one, or the two drift apart the moment a resolution changes.
  const radius = movieRecapBlurRadius(MOVIE_RECAP_BLUR.radius, aspectRatio);
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

// How fast the picture cuts, how long a narration line runs, and where the
// caption sits — keyed on the ASPECT RATIO, because the aspect ratio IS the
// format here (user's decision, 2026-09-17): 9:16 goes to TikTok and Facebook,
// 16:9 goes to YouTube, and nothing else distinguishes them.
//
// This is the only aspect-keyed table that is not about the picture's SHAPE.
// Caption size, zoom and output dimensions are all consequences of the frame;
// these are consequences of where the video is posted. Kept together anyway,
// because splitting them would mean a second field that always moves with this
// one.
//
// THE INVARIANT, for any preset added here: `floor(t / minShotS)` must never be
// less than `ceil(t / maxContinuousSourceS)`, or the planner is asked for more
// cuts than the shot floor can pay for. `movie-recap-shots.test.ts` asserts it
// across every preset — check there before inventing a third.
export const MOVIE_RECAP_PACING = {
  // SHORT FORM. Measured, not reasoned: these came out of real exports and four
  // tuning passes (history/movie-recap.md, 2026-09-16/17). A vertical recap is
  // watched with a thumb on the screen, and the cutting is what holds it.
  "9:16": {
    // Nearly every shot lands in a 1.5-2.5s band. They were 1.4 and 1.0, which
    // the `ceil` bias pushed onto the floor: a measured export ran 20 shots in
    // 19.7s, mean 0.98s, and an action does not land in one second.
    minShotS: 1.5,
    shotTargetS: 2,
    // The planning target for borrowing: a beat pulls unused scenes until it can
    // be cut without exceeding this. A target, not a guarantee.
    maxShotS: 2.4,
    // THE HARD ONE. No source footage may be on screen this long without a cut.
    maxContinuousSourceS: 3,
    // One idea per line. The line's length decides how long its beat holds, so
    // this is the pacing control the narration model actually has.
    // Raised from 25-45 (max 50). At 40 characters a line had to carry who
    // someone is, what they did and what they are doing now, and the only way
    // to fit that is to stack it all into one clause before the verb —
    // "အဘွားကိုအလုပ်ခေါ်လာတဲ့ကောင်မလေးက..." reported by the user as awkward, and
    // it is over-compression, not bad grammar. Costs nothing in pacing: on 9:16
    // a longer beat buys MORE cuts, since `minShotS` is 1.5.
    lineChars: [40, 70],
    lineMaxChars: 80,
    // A beat's timed length before measured audio stretches it.
    maxSegmentS: 3.5,
    // Percent of frame height the caption sits above the bottom edge. Higher on
    // 9:16 than on 16:9 because TikTok and Facebook draw the post caption, the
    // username and the audio ticker over the bottom of the frame — at 8% the
    // burned subtitle lands behind their UI. NOT yet checked against a real
    // post; it is a starting value to eyeball, not a measured one.
    subtitleOffsetPct: 18,
    // How many frames the vision pass sees per scene. THREE, because one still
    // cannot show an EVENT: "two men argue" is a frame, "he draws and she runs"
    // is a change over time, and a fast-cut recap lives on the second kind. The
    // model describes what changes across them and says which frame is the peak.
    // Frames go at `detail: "low"` (~19 prompt tokens each), so this is a
    // request-size and ffmpeg-time cost, not really a token one.
    keyframesPerScene: 3,
  },
  // LONG FORM. Reasoned, NOT measured — derived from the arithmetic below and
  // never rendered at length. Treat as a first draft to test.
  "16:9": {
    // 2-4s. The short-form band cut a typical beat in half: a 25-45 character
    // line is 2.5-3.5s of speech, and `floor(t / 1.5)` made that two ~1.5s
    // shots. On a laptop or a TV that reads as churn rather than pace.
    //
    // `minShotS` is also the SPLIT THRESHOLD, and it is the number that decides
    // the feel of the whole video: `floor(t / 2)` is 1 until the beat reaches
    // 4s, so a normal line plays as ONE clip and only a long one is cut.
    minShotS: 2,
    shotTargetS: 3.5,
    maxShotS: 4,
    // Moved WITH minShotS, not separately: at 2/3 the invariant above fails (a
    // 3.5s beat asks for 2 cuts and can afford 1).
    maxContinuousSourceS: 4,
    // Longer lines are what make 3-4s shots reachable at all — a 45-character
    // line cannot hold a 4s clip without the picture stalling.
    lineChars: [45, 80],
    lineMaxChars: 90,
    maxSegmentS: 6,
    subtitleOffsetPct: 8,
    // ONE, unchanged. Multi-frame description is a 9:16-only experiment for now
    // (user's call). If it proves out on a reel it should come here too — there
    // is nothing format-specific about describing an event properly.
    keyframesPerScene: 1,
  },
} as const satisfies Record<MovieRecapAspectRatio, MovieRecapPacing>;

export type MovieRecapPacing = {
  minShotS: number;
  shotTargetS: number;
  maxShotS: number;
  maxContinuousSourceS: number;
  lineChars: readonly [number, number];
  lineMaxChars: number;
  maxSegmentS: number;
  subtitleOffsetPct: number;
  keyframesPerScene: number;
};

export function movieRecapPacing(aspectRatio: MovieRecapAspectRatio): MovieRecapPacing {
  return MOVIE_RECAP_PACING[aspectRatio];
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
