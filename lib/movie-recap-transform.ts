import {
  effectiveMovieRecapZoom,
  MOVIE_RECAP_COPYRIGHT_TRANSFORM,
  MOVIE_RECAP_TARGET_DIMENSIONS,
} from "./constants/movie-recap";
import type { MovieRecapProject } from "./api/types";

// Builds the ffmpeg filter chain for ONE shot: how the source is framed into the
// output, plus the copyright-free transform when the project asks for it.
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
  copyrightFree: boolean;
  // A divisor on the source crop, so 1 is no zoom. Per project, not a constant.
  zoom: number;
};

export function shotFilterContext(project: MovieRecapProject): ShotFilterContext {
  return {
    aspectRatio: project.aspectRatio,
    fitMode: project.fitMode,
    copyrightFree: project.copyrightFree,
    zoom: effectiveMovieRecapZoom(project),
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
  const zoom = ctx.copyrightFree ? ctx.zoom : 1;
  const zoomed = zoomSteps(zoom, w, h);

  if (ctx.fitMode !== "contain") {
    // Already fills the frame, so zoom takes more off the edges.
    return [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`, ...zoomed].join(",");
  }
  if (!ctx.copyrightFree) {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }
  // Blurred backfill: the same clip, scaled to cover and blurred, sits behind the
  // contained copy. The background moves with the footage rather than being a
  // still, and the bars stop reading as missing picture. The foreground is fitted
  // and THEN zoomed, so zooming eats into the bars rather than into the picture.
  const { backfillBlurRadius: radius, backfillBlurPasses: passes } = MOVIE_RECAP_COPYRIGHT_TRANSFORM;
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
  if (!ctx.copyrightFree) return [];
  const { contrast, saturation, gamma, mirrorAspectRatios } = MOVIE_RECAP_COPYRIGHT_TRANSFORM;
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
  return [framingFilter(ctx), ...adjustmentFilters(ctx)].join(",");
}
