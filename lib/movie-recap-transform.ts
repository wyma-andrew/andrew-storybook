import {
  MOVIE_RECAP_HOLD_MOTION,
  effectiveMovieRecapZoom,
  MOVIE_RECAP_LOOK,
  MOVIE_RECAP_TARGET_DIMENSIONS,
  movieRecapBlurRadius,
} from "./constants/movie-recap";
import type { MovieRecapProject } from "./api/types";

// Builds the ffmpeg filter chain for ONE shot: how the source is framed into the
// output, plus the house look — blurred backfill, zoom, mirror, colour grade —
// which every shot now gets (the per-project toggle is gone, 2026-09-19).
//
// It lives apart from the render because the two answer different questions. The
// render decides WHICH piece of source plays and for HOW LONG; this decides what
// that piece looks like. Keeping them separate means a new transform is a new
// entry here and nothing else moves — and the whole thing is a pure string
// builder, so it can be tested without ffmpeg.
//
// Everything a transform step needs, and nothing it does not: the shot's own
// timing is deliberately absent, because a step that changed a shot's DURATION
// would have to be planned by the render, not appended here (a speed change or a
// freeze is exactly that, and is why neither is in this file).
export type ShotFilterContext = {
  aspectRatio: MovieRecapProject["aspectRatio"];
  fitMode: MovieRecapProject["fitMode"];
  // A divisor on the source crop, so 1 is no zoom. Per project, not a constant.
  zoom: number;
  // The source's own letterbox, cut away before anything else. A 2.39:1 film
  // delivered in a 16:9 file carries its bars as PIXELS, so without this the
  // framing step sees 16:9 into 16:9, decides the fit is exact, and the black
  // band rides through to the render. See lib/movie-recap-crop.ts.
  crop?: { width: number; height: number; x: number; y: number } | null;
};

export function shotFilterContext(
  project: MovieRecapProject,
  crop?: ShotFilterContext["crop"]
): ShotFilterContext {
  return {
    aspectRatio: project.aspectRatio,
    fitMode: project.fitMode,
    zoom: effectiveMovieRecapZoom(project),
    crop: crop ?? null,
  };
}

// Zoom magnifies the FITTED picture, so it is applied after framing, never
// before. Cropping the source first would keep the source's aspect ratio, which
// means the letterbox bars on `contain` stay exactly as wide however far you zoom
// — the picture just loses its edges inside unchanged bars. Scaling the fitted
// result instead makes the picture grow into the frame and the bars shrink, which
// is what "zoom" is expected to do.
//
// `min(iw,...)` because on `contain` the zoomed picture may still be smaller than
// the frame — crop must not ask for more than it was given.
function zoomSteps(zoom: number, w: number, h: number) {
  if (!Number.isFinite(zoom) || zoom <= 1) return [];
  return [
    // Even dimensions: an odd width breaks yuv420p chroma subsampling.
    `scale=trunc(iw*${zoom}/2)*2:trunc(ih*${zoom}/2)*2`,
    // The commas inside these expressions must reach ffmpeg escaped, or it reads
    // them as filter separators and fails with "No such filter". In a template
    // literal that means a DOUBLE backslash: `\\,` emits `\,`, while `\,`
    // collapses to a bare comma.
    `crop=min(iw\\,${w}):min(ih\\,${h})`,
  ];
}

// How the source becomes an output frame, with zoom applied to the result.
// `cover` crops to fill; `contain` fits the whole picture and has to put
// something in the bars it leaves.
function framingFilter(ctx: ShotFilterContext) {
  const [w, h] = MOVIE_RECAP_TARGET_DIMENSIONS[ctx.aspectRatio];
  const zoomed = zoomSteps(ctx.zoom, w, h);

  if (ctx.fitMode !== "contain") {
    // Already fills the frame, so zoom takes more off the edges.
    return [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`, ...zoomed].join(",");
  }
  // Blurred backfill: the same clip, scaled to cover and blurred, sits behind the
  // contained copy. The background moves with the footage rather than being a
  // still, and the bars stop reading as missing picture. The foreground is fitted
  // and THEN zoomed, so zooming eats into the bars rather than into the picture.
  const { backfillBlurRadius, backfillBlurPasses: passes } = MOVIE_RECAP_LOOK;
  // Scaled to the output width: a fixed pixel radius blurs relatively less on a
  // bigger frame, and the backfill has to stay unreadable, not merely soft.
  const radius = movieRecapBlurRadius(backfillBlurRadius, ctx.aspectRatio);
  const fg = [`scale=${w}:${h}:force_original_aspect_ratio=decrease`, ...zoomed].join(",");
  return [
    `split[bg][fg]`,
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=${radius}:${passes}[bgb]`,
    `[fg]${fg}[fgs]`,
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2`,
  ].join(";");
}

// Steps that only recolour or flip the finished frame. They compose by
// concatenation, so they stay a plain comma-joined list.
function adjustmentFilters(ctx: ShotFilterContext) {
  const { contrast, saturation, gamma, mirrorAspectRatios } = MOVIE_RECAP_LOOK;
  const filters: string[] = [];
  if (mirrorAspectRatios.includes(ctx.aspectRatio)) filters.push("hflip");
  filters.push(`eq=contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`);
  return filters;
}

// The complete chain for one shot.
//
// The result is appended to by the render (`setpts`, `tpad`), which works because
// the graph ends on a single unlabelled filter: `a;b;c[x][y]overlay=...` accepts
// `,setpts=...` on the end and keeps one output. Any step added here must leave
// the chain in that state.
export function buildShotFilter(ctx: ShotFilterContext) {
  // FIRST, before framing: everything after this reasons about the aspect ratio
  // of what it is given, and the bars are what make that ratio a lie.
  const source = ctx.crop ? [`crop=${ctx.crop.width}:${ctx.crop.height}:${ctx.crop.x}:${ctx.crop.y}`] : [];
  return [...source, framingFilter(ctx), ...adjustmentFilters(ctx)].join(",");
}

// Motion for a shot whose slot outlasts its footage: the picture pushes in
// across the WHOLE shot, so the moment the footage runs out and the last frame
// is held, nothing on screen stops. A dead hold is what reads as a broken
// render; a push-in reads as a choice.
//
// A sideways drift used to ride along with the push-in and was removed
// (2026-09-19): on a held frame the pan was the part that read as an effect,
// and the push-in alone already carries the hold.
//
// Timing IS a parameter here, unlike everything above it. The rule that keeps it
// out of `ShotFilterContext` is about steps that change a shot's DURATION — a
// speed change or a freeze — because those have to be planned, not appended.
// This changes nothing about the shot's length: `slotS` seconds in, `slotS`
// seconds out. It only needs to know the length in order to finish its drift
// exactly as the shot ends.
//
// Goes AFTER `tpad` in the chain, so the held frames are already there to move.
export function holdMotionFilter({
  aspectRatio,
  slotS,
  fps,
}: {
  aspectRatio: MovieRecapProject["aspectRatio"];
  slotS: number;
  fps: number;
}) {
  const [w, h] = MOVIE_RECAP_TARGET_DIMENSIONS[aspectRatio];
  const { zoom, prescale, supersample } = MOVIE_RECAP_HOLD_MOTION;
  // At least two frames, or the `frames - 1` denominator below divides by zero.
  const frames = Math.max(2, Math.round(slotS * fps));
  const step = ((zoom - 1) / (frames - 1)).toFixed(6);
  // Clamped, because `tpad` deliberately overshoots the slot before the output
  // `-t` cuts back: without the clamp those extra frames would keep zooming.
  const z = `min(1+${step}*on\\,${zoom.toFixed(4)})`;
  // The room the zoom opens up, kept centred: a straight push-in, no pan.
  const centre = (dimension: string) => `(${dimension}-${dimension}/zoom)/2`;
  // THE TIMEBASE REBUILD IS NOT OPTIONAL. zoompan hands on frames whose
  // timestamps the `fps` filter that `segmentFilters()` always appends cannot
  // make sense of, and that filter answers by duplicating frames without bound:
  // a shot that should be 163 frames reached 9,401 in twenty seconds and was
  // still climbing, writing an 18MB file for five seconds of video. One real
  // render spent SIX MINUTES on a single shot that way.
  //
  // `settb` then `setpts=N` rewrites the stamps as a clean frame count at the
  // target rate, so the trailing `fps` has nothing left to conform. Measured on
  // the real source: exactly 163 frames out. Dropping zoompan's own `fps=`
  // option is NOT a fix on its own — that was tried, and it still ran away.
  return [
    `scale=${w * prescale}:${h * prescale}`,
    `zoompan=z='${z}':d=1:x='${centre("iw")}':y='${centre("ih")}':s=${w * supersample}x${h * supersample}`,
    // Back to the output's own size. NOT cosmetic: the downscale is what turns
    // zoompan's whole-pixel steps into fractions of a pixel, which is what stops
    // a held frame shaking. A segment that came out any other size could not be
    // concatenated either.
    `scale=${w}:${h}`,
    `settb=1/${fps}`,
    `setpts=N`,
  ].join(",");
}
