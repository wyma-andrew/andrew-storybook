import { listVoices } from "../tts/voices";
// Type-only, so it is erased at build time and creates no import cycle with
// api/types.ts, which imports the value types from this file.
import type { MovieRecapRenderStage, MovieRecapTranscriptStage } from "../api/types";

export const MOVIE_RECAP_LANGUAGES = [{ id: "my", name: "Burmese" }] as const;
// The voices the Transcript step offers, taken from the TTS catalog so the picker
// and the synthesizer can never disagree about which voices exist.
export const MOVIE_RECAP_VOICES = listVoices("movie-recap");

export const MOVIE_RECAP_ASPECT_RATIOS = [
  { id: "9:16", name: "9:16" },
  { id: "16:9", name: "16:9" },
  { id: "1:1", name: "1:1" },
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
  // 3.4% was the floor at 720p. 3.0% (~32px) is only legible because output
  // is now 1080p — do not lower this while rendering at 720p.
  "16:9": 3,
  // Portrait runs a little larger than the width rule alone gives (2.2 rather
  // than 2.0, i.e. 3.9% of width against 3.6%): a phone-sized frame is watched
  // at phone size, and 2.0 read undersized on it. 2.5 read large.
  "9:16": 2.2,
  // Square leaves less room around persistent social overlays than landscape.
  // Keep its captions compact so one Burmese line does not dominate the frame.
  "1:1": 2,
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

// How a recap LOOKS, applied to every shot. This was once the "copyright-free"
// transform, behind a per-project toggle, and the toggle is gone: these are
// simply the house look now (user's decision, 2026-09-19). Every value stays
// deliberately mild — the point is a finished picture, not a processed one.
//
// The per-shot playback speed that used to live here is gone with the toggle. It
// existed so no shot ever played at the source's own speed, which was an
// anti-fingerprinting goal and nothing else.
//
// These live here rather than in the render so the numbers are readable in one
// place and can be shown in the UI later without importing the render.
// The source-selection cadence and playback rate are one policy because every
// timing calculation needs all three values. The planner, mock preview and real
// render read this object; ffmpeg commands do not carry private copies.
export const MOVIE_RECAP_EDIT = {
  retainSourceS: 3,
  skipSourceS: 1,
  playbackSpeed: 0.75,
  minSourceS: 0.05,
} as const;

export const MOVIE_RECAP_PLAYBACK_SPEED = MOVIE_RECAP_EDIT.playbackSpeed;
// A shortage beat may slow below the baseline so it stays moving instead of
// freezing immediately. These are policy limits, not per-render guesses.
export const MOVIE_RECAP_MIN_PLAYBACK_SPEED = 0.65;
export const MOVIE_RECAP_TINY_FREEZE_S = 0.15;
export const MOVIE_RECAP_TIMELINE_FRAME_REPAIR_LIMIT = 2;

// All cached narration masters use this format. Keeping it beside the edit
// policy makes the audio timeline just as configurable as the picture timeline.
export const MOVIE_RECAP_NARRATION_SAMPLE_RATE = 24_000;

// Applied once while the cached narration master is assembled. This is fixed:
// narration length owns the timeline, and picture is trimmed, slowed or frozen
// per beat to match it. Individual TTS caches stay at the provider output rate,
// so tuning this rebuilds narration.wav without synthesizing unchanged speech.
export const MOVIE_RECAP_NARRATION_PLAYBACK_RATE = 1.2;

// While one beat preview plays, prepare this many following beats so sequential
// playback normally advances without waiting on R2 or ffmpeg.
export const MOVIE_RECAP_NARRATION_PRELOAD_BEATS = 3;

// How wide a ribbon group is: consecutive timestamped blocks are merged until
// the group spans at least this long, and the ribbon shares footage inside it.
//
// The stamps themselves stay — a group's own start and end are real stamps, and
// the stamps inside it are where the ribbon starts each line before it adjusts.
// This exists because a transcript pulled off a video's narration track carries
// a stamp every 3-4s, and a 3s wall cannot absorb the fact that Burmese takes
// longer to say than the English it came from. Measured on a 40-line script:
// per-line walls left 12.2s of held frame and 399 characters to cut, 25s groups
// left 2.6s and 215 characters. Bigger groups do a little better and drift more
// — 25s is the block size the same feature already shipped with.
export const MOVIE_RECAP_RIBBON_GROUP_S = 25;

// How far a line's picture may sit from the timestamp that line was written
// against. The group's own two stamps are walls; this is what the stamps INSIDE
// it are worth.
//
// Without it the ribbon placed every line purely by speech length and a line
// drifted up to 5s from its own moment — measured on a 45s recap, where beat 4
// spoke over the tail of beat 3's scene. Capping it costs almost nothing: at
// 0.5s the same recap holds 0.12s of frame against 0.00s uncapped, while the
// worst drift falls from 5.0s to 0.5s. At 0s — stamps as hard walls — it is
// 1.93s of held frame, which is the trade this number exists to avoid.
export const MOVIE_RECAP_RIBBON_DRIFT_CAP_S = 0.5;


export const MOVIE_RECAP_LOOK = {
  // Zoom is per project now (`copyrightZoom`), not a constant — see
  // MOVIE_RECAP_ZOOM below for the range and the recommendations.
  // eq: still a grade rather than a style, but no longer invisible. The first
  // values (1.06 / 1.08 / 0.98) were chosen to be safe and read as nothing at
  // all next to the source; these were picked off a four-way comparison on real
  // footage (user's choice, 2026-09-20). Two stronger candidates were rejected
  // with them: adding `unsharp` to claw back the softness of slowed footage and
  // the letterbox crop introduce, which lifts grain with it, and a teal-orange
  // balance, which is the recap-channel look and further from the source than
  // the user wanted.
  contrast: 1.12,
  saturation: 1.18,
  gamma: 0.96,
  // Both ratios. It was landscape-only at first, following the original spec
  // where mirroring sat under the 16:9 rules; portrait was added once the
  // transform was running. The cost is the same either way: any text in frame —
  // signs, screens, captions already burned into the source — reads backwards.
  // Mirroring is the user's call, taken knowing the cost: any text in frame —
  // signs, screens, subtitles already burned into the source — reads backwards.
  // The recap's OWN subtitles are safe, because they are burned on the
  // concatenated video long after this.
  mirrorAspectRatios: ["16:9", "9:16", "1:1"] as readonly string[],
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
  // Every case is 1 — no zoom — by the user's decision (2026-09-19). Still keyed
  // by fit mode and aspect ratio because this is the SEEDING mechanism: a NULL
  // `copyright_zoom` means "use the recommendation for this pair", so raising one
  // case later is a one-line change here rather than a new concept.
  //
  // What these held before, which is worth knowing before raising any of them
  // again: 9:16 `contain` was 1.56, and that number was doing a job — it is what
  // kept a landscape source from sitting in a narrow centre strip between wide
  // blurred bars. 9:16 `cover` was 1.05. Both 16:9 cases were already 1, because
  // a landscape frame has nothing spare to give. See history/movie-recap.md.
  recommended: {
    contain: {
      "16:9": 1,
      "9:16": 1,
      "1:1": 1,
    },
    cover: {
      "16:9": 1,
      "9:16": 1,
      "1:1": 1,
    },
  },
} as const satisfies {
  min: number;
  max: number;
  step: number;
  recommended: Record<string, Record<string, number>>;
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
  { id: "narration", label: "Narration", stages: ["synthesizing_narration"] },
  { id: "video", label: "Video", stages: ["rendering_segments", "concatenating", "applying_overlays"] },
  { id: "publish", label: "Publish", stages: ["uploading"] },
] as const satisfies readonly { id: string; label: string; stages: readonly MovieRecapRenderStage[] }[];

// The script run's own bar. It stops before anything is cut, so it carries only
// the steps up to and including the narration it speaks in order to measure it.
export const MOVIE_RECAP_SCRIPT_STEPS = [
  { id: "download", label: "Source", stages: ["downloading_source"] },
  { id: "script", label: "Script", stages: ["writing_script"] },
  { id: "narration", label: "Narration", stages: ["synthesizing_narration"] },
] as const satisfies readonly { id: string; label: string; stages: readonly MovieRecapRenderStage[] }[];

// The transcript step's own stages, grouped the same way. "Dialogue" covers the
// two alternatives — a source with subtitles never transcribes, and one without
// never reads captions.
export const MOVIE_RECAP_TRANSCRIPT_STEPS = [
  { id: "download", label: "Source", stages: ["downloading_source"] },
  { id: "dialogue", label: "Dialogue", stages: ["reading_captions", "extracting_audio", "transcribing"] },
  { id: "story", label: "Burmese story", stages: ["translating"] },
] as const satisfies readonly { id: string; label: string; stages: readonly MovieRecapTranscriptStage[] }[];

// Retelling alone reuses the stored transcript, so these two genuinely do not
// run — shown as skipped for the same reason a mock render's are.
export const MOVIE_RECAP_STORY_ONLY_SKIPPED_STEPS = ["download", "dialogue"] as const;

// No parked work is displayed: the bars list only the independent audio and
// full-source footage stages that still run.
export const MOVIE_RECAP_PARKED_STEPS = [] as const;

// A mock render produces its narration from canned text and never touches the
// source's pictures, audio or any model, so these steps genuinely do not run.
// They are shown as skipped rather than done — claiming a mock "transcribed the
// dialogue" would be a lie told by a progress bar.
export const MOVIE_RECAP_MOCK_SKIPPED_STEPS = ["download", "narration"] as const;

// A held frame moves instead of sitting dead: the picture pushes in slowly, the
// way a documentary treats a still. Applied ONLY to a shot whose slot outlasts
// its footage — a shot with enough footage is never touched.
//
// `zoom` is where the push-in ends (1.12 = 12% tighter by the end of the shot).
// Small on purpose: past ~1.2 it reads as a deliberate zoom rather than as the
// picture simply being alive. `prescale` is a straight quality fix: zoompan
// snaps its window to whole pixels, and doing that on a doubled frame halves the
// step it snaps by. Measured at 1080x1920: the doubling costs nothing next to
// the encode.
export const MOVIE_RECAP_HOLD_MOTION = {
  zoom: 1.12,
  prescale: 2,
  // zoompan renders at this multiple of the output and the chain scales back
  // down. `prescale` alone was not enough: zoompan still places its window on
  // whole pixels, so a slow push-in holds for a few frames and then jumps one,
  // which reads as a shake on a held frame. Rendering large and shrinking makes
  // that jump a fraction of an output pixel — the downscale averages it away.
  supersample: 2,
} as const;

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
  // 1080p, raised from 1280x720 so captions could shrink below 3.4% without
  // Burmese marks closing into the letter.
  "16:9": [1920, 1080],
  // 1080x1920, raised from 720x1280 once reels were being published rather than
  // test-rendered. TikTok, Facebook and Reels all re-encode whatever they are
  // given, so handing them a 720-wide source means their compression starts
  // from an already-soft picture — worst on the burned Burmese captions, whose
  // stacked marks are the first thing to go.
  "9:16": [1080, 1920],
  // Square social exports keep the same 1080px working width as portrait.
  "1:1": [1080, 1080],
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
// Anchoring per ratio keeps each radius relative to the frame it was tuned on.
const BLUR_REFERENCE_WIDTH = {
  "16:9": 1280,
  "9:16": 720,
  "1:1": 1080,
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

function movieRecapBoxBlurCssPx(
  frameWidthPx: number,
  aspectRatio: MovieRecapAspectRatio,
  baseRadius: number,
  passes: number
) {
  const outputWidthPx = MOVIE_RECAP_TARGET_DIMENSIONS[aspectRatio][0];
  const radius = movieRecapBlurRadius(baseRadius, aspectRatio);
  const sigma = Math.sqrt((passes * ((2 * radius + 1) ** 2 - 1)) / 12);
  return outputWidthPx > 0 ? (sigma * frameWidthPx) / outputWidthPx : sigma;
}

export function movieRecapBlurCssPx(frameWidthPx: number, aspectRatio: MovieRecapAspectRatio) {
  return movieRecapBoxBlurCssPx(
    frameWidthPx,
    aspectRatio,
    MOVIE_RECAP_BLUR.radius,
    MOVIE_RECAP_BLUR.passes
  );
}

export function movieRecapBackfillBlurCssPx(frameWidthPx: number, aspectRatio: MovieRecapAspectRatio) {
  return movieRecapBoxBlurCssPx(
    frameWidthPx,
    aspectRatio,
    MOVIE_RECAP_LOOK.backfillBlurRadius,
    MOVIE_RECAP_LOOK.backfillBlurPasses
  );
}

// Logo geometry is shared by the CSS preview and the ffmpeg overlay. Logo files
// are square, so the contain box is square too rather than using independent
// percentages of the frame width and height.
export const MOVIE_RECAP_LOGO_BOX = { widthPct: 10, portraitWidthPct: 10, heightPct: 8, marginPct: 4 } as const;

// Centred text mark burned under the logo. `sizePct` is of frame height, like
// subtitles. 16:9 read large at 3.4% and 2.2%.
export const MOVIE_RECAP_WATERMARK = {
  color: "#FFFFFF",
  opacityPct: 30,
  weight: 700,
  letterSpacingEm: 0.14,
  sizePct: { "16:9": 1.5, "9:16": 1.9, "1:1": 1.9 } satisfies Record<MovieRecapAspectRatio, number>,
} as const;

// The stand-in caption the step-3 preview draws. It is also the mock render's
// first line, so a mock render puts the EXACT same words on screen as the
// preview — the only honest way to compare the two designs.
export const MOVIE_RECAP_SUBTITLE_SAMPLE = "စာတန်းထိုးဒီနေရာမှာပေါ်ပါမယ်";

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

// How many frames the vision pass sees per scene. THREE, because one still
// cannot show an EVENT: "two men argue" is a frame, "he draws and she runs" is a
// change over time, and a fast-cut recap lives on the second kind. The model
// describes what changes across them and says which frame is the peak.
//
// NOT keyed on the aspect ratio. It was, at 3 on 9:16 and 1 on 16:9, and that
// was the one thing in MOVIE_RECAP_PACING that changed how the story is
// UNDERSTOOD rather than how it is presented — a 16:9 recap was built from a
// weaker reading of the same film. Nothing about describing an event properly is
// format-specific. See history/movie-recap.md.
//
// Frames go at `detail: "low"` (~19 prompt tokens each), so the cost is ffmpeg
// seek time and request size, not really tokens.
export const MOVIE_RECAP_KEYFRAMES_PER_SCENE = 3;

// How far the reading speed may be pushed so the finished narration fits the
// film, applied ONCE for the whole video.
//
// Per-beat fitting was built first and thrown out: a narrator who speeds up and
// slows down every few seconds sounds wrong however well the numbers line up.
// One rate for the whole recap is what a person hears as a reading. `min`/`max`
// multiply the voice's own rate, so 1.15 on a +15% voice reads at +32%.
//
// Past `max` the fit stops: the recap simply runs longer than its source, the
// last block holds a frame, and the Transcript step says which block has too
// much text for its timestamps. A line read at +70% is not a recap, it is an
// auctioneer.
//
// `tolerance` is the band inside which nothing is re-synthesized — a second TTS
// pass to move the video by 1% is spend for nothing.
export const MOVIE_RECAP_NARRATION_RATE_FIT = { min: 0.92, max: 1.15, tolerance: 0.02 } as const;

// Laying the picture under the locked narration; see lib/movie-recap-ribbon.ts.
//
// `driftCapS` is how far the picture may sit from the timestamp that describes
// it before the next block re-anchors. Five seconds is a shot or so: a cut that
// lands a second or two from where it was typed is invisible, while forcing the
// picture onto an exact timestamp is a jump the viewer sees. The cap exists to
// stop drift ACCUMULATING — without it a run of long blocks walks the picture
// half a minute behind the words by the end.
//
// The snap windows put every jump on one of the film's own edits. The re-anchor
// one is wider because that jump is already visible, so landing it on a real cut
// matters more than hitting the typed second exactly.
export const MOVIE_RECAP_RIBBON = { driftCapS: 5, startSnapS: 1, resyncSnapS: 2 } as const;

// One idea per narration line, in Burmese characters. The line's length decides
// how long its beat holds the screen, which makes this a pacing control — but it
// is spent by WRITING the line, so it also decides the words.
//
// NOT keyed on the aspect ratio, and that is the point: one script has to serve
// both. Keyed on it, the same film posted to TikTok and to YouTube came back as
// two different scripts, so a line fixed in one was still wrong in the other and
// neither could be compared with the other. Ratio now chooses how many pieces
// the narration is CUT into, never what it says. See history/movie-recap.md.
//
// The values are the wider, 16:9 pair. 9:16 kept 40-70 (itself raised from
// 25-45, because at 40 characters a line had to carry who someone is, what they
// did and what they are doing now, and the only way to fit that is to stack it
// into one clause before the verb — reported as awkward, and it is
// over-compression rather than bad grammar). Widening 9:16 again costs it
// nothing: a longer beat there buys MORE cuts, since `minShotS` is 1.5. The
// narrower pair would have cost 16:9 real pacing — a 45-character line cannot
// hold a 4s clip without the picture stalling.
export const MOVIE_RECAP_LINE_CHARS = [45, 80] as const;
export const MOVIE_RECAP_LINE_MAX_CHARS = 90;

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
    // A beat's timed length before measured audio stretches it.
    maxSegmentS: 3.5,
    // Percent of frame height the caption sits above the bottom edge. Higher on
    // 9:16 than on 16:9 because TikTok and Facebook draw the post caption, the
    // username and the audio ticker over the bottom of the frame — at 8% the
    // burned subtitle lands behind their UI. NOT yet checked against a real
    // post; it is a starting value to eyeball, not a measured one.
    subtitleOffsetPct: 18,
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
    maxSegmentS: 6,
    subtitleOffsetPct: 8,
  },
  // SQUARE SOCIAL. Keep short-form cutting, with a middle subtitle offset
  // because square posts have less reserved UI space than vertical posts.
  "1:1": {
    minShotS: 1.5,
    shotTargetS: 2,
    maxShotS: 2.4,
    maxContinuousSourceS: 3,
    maxSegmentS: 3.5,
    subtitleOffsetPct: 12,
  },
} as const satisfies Record<MovieRecapAspectRatio, MovieRecapPacing>;

export type MovieRecapPacing = {
  minShotS: number;
  shotTargetS: number;
  maxShotS: number;
  maxContinuousSourceS: number;
  maxSegmentS: number;
  subtitleOffsetPct: number;
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
