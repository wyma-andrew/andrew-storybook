import { MOVIE_RECAP_COPYRIGHT_TRANSFORM, MOVIE_RECAP_TARGET_DIMENSIONS } from "./constants/movie-recap";
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
};

export function shotFilterContext(project: MovieRecapProject): ShotFilterContext {
  return { aspectRatio: project.aspectRatio, fitMode: project.fitMode, copyrightFree: project.copyrightFree };
}

// A crop that throws away the outer edges before the frame is scaled up to fill
// the output. Applied first so everything after it works on the kept region.
function zoomFilter(ctx: ShotFilterContext) {
  if (!ctx.copyrightFree) return null;
  const { zoom } = MOVIE_RECAP_COPYRIGHT_TRANSFORM;
  if (zoom <= 1) return null;
  // Even dimensions: an odd crop width breaks yuv420p chroma subsampling.
  return `crop=floor(iw/${zoom}/2)*2:floor(ih/${zoom}/2)*2`;
}

// How the kept region becomes an output frame. `cover` crops to fill; `contain`
// fits the whole picture and has to put something in the bars it leaves.
function framingFilter(ctx: ShotFilterContext) {
  const [w, h] = MOVIE_RECAP_TARGET_DIMENSIONS[ctx.aspectRatio];
  if (ctx.fitMode !== "contain") {
    return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  }
  if (!ctx.copyrightFree) {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }
  // Blurred backfill: the same clip, scaled to cover and blurred, sits behind the
  // contained copy. The background moves with the footage rather than being a
  // still, and the bars stop reading as missing picture.
  const { backfillBlurRadius: radius, backfillBlurPasses: passes } = MOVIE_RECAP_COPYRIGHT_TRANSFORM;
  return [
    `split[bg][fg]`,
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=${radius}:${passes}[bgb]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs]`,
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
  const zoom = zoomFilter(ctx);
  const head = zoom ? `${zoom},${framingFilter(ctx)}` : framingFilter(ctx);
  return [head, ...adjustmentFilters(ctx)].join(",");
}
