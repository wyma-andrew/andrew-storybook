import { FFMPEG, runReadingStderr } from "./movie-recap-ffmpeg";

export type ContentCrop = { width: number; height: number; x: number; y: number };

// How much of a side has to be black before it counts as letterboxing rather
// than a dark scene. A film that opens on night can read as bars for a second,
// so the detection samples several points in the source and takes the SMALLEST
// crop any of them agreed on — a bar that is not in every sample is a shot, not
// a border.
const SAMPLE_POINTS = 5;
// Luma at or below this is black enough to be a bar. ffmpeg's own default.
const BLACK_LIMIT = 24;
// Below this the "bars" are a pixel or two of encoder edge, not letterboxing,
// and cropping them buys nothing while risking a shifted frame.
const MIN_BAR_PX = 8;

const CROP = /crop=(\d+):(\d+):(\d+):(\d+)/g;

/**
 * The rectangle of a source that is actually picture.
 *
 * Films are routinely delivered as 2.39:1 inside a 16:9 file, and those bars are
 * PIXELS — ffmpeg cannot tell them from the film. Without this the framing step
 * sees a 16:9 source going into a 16:9 frame, decides nothing needs doing, and
 * the bars ride through to the render as a black band the blurred backfill was
 * built to replace.
 *
 * Returns null when the source is already all picture, which is the common case
 * and means the caller does nothing.
 */
export async function detectContentCrop(
  videoPath: string,
  durationS: number,
  signal?: AbortSignal
): Promise<ContentCrop | null> {
  const found: ContentCrop[] = [];
  for (let i = 1; i <= SAMPLE_POINTS; i++) {
    const at = (durationS * i) / (SAMPLE_POINTS + 1);
    // `cropdetect` reports on stderr and needs a few frames to settle, so this
    // reads a second of video at each point and takes its last verdict.
    const stderr = await runReadingStderr(
      FFMPEG,
      ["-v", "info", "-ss", at.toFixed(2), "-i", videoPath, "-frames:v", "24", "-vf", `cropdetect=${BLACK_LIMIT}:2:0`, "-f", "null", "-"],
      signal
    );
    const matches = [...stderr.matchAll(CROP)];
    const last = matches[matches.length - 1];
    if (!last) continue;
    found.push({ width: Number(last[1]), height: Number(last[2]), x: Number(last[3]), y: Number(last[4]) });
  }
  if (!found.length) return null;

  // The LOOSEST crop any sample asked for: a bar every sample agrees on is a
  // border, and one only a dark scene produced is not.
  const left = Math.min(...found.map((c) => c.x));
  const top = Math.min(...found.map((c) => c.y));
  const right = Math.max(...found.map((c) => c.x + c.width));
  const bottom = Math.max(...found.map((c) => c.y + c.height));
  if (left < MIN_BAR_PX && top < MIN_BAR_PX) return null;

  // Even dimensions and offsets: odd ones break yuv420p chroma subsampling. An
  // OFFSET of zero is valid and a dimension of zero is not, so they floor
  // differently — clamping both to 2 pushed a full-width crop off the right edge.
  const evenSize = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const evenOffset = (value: number) => Math.max(0, Math.floor(value / 2) * 2);
  const x = evenOffset(left);
  const y = evenOffset(top);
  return { width: evenSize(right - x), height: evenSize(bottom - y), x, y };
}
