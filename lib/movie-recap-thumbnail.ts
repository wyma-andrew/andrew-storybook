import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { thumbnailTimeFor } from "./movie-recap";
import { buildShotFilter, shotFilterContext } from "./movie-recap-transform";
import { deleteObject, movieRecapObjectKey, putObject } from "./r2";
import type { MovieRecapProject } from "./api/types";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

// 2 = visually lossless for a still at these sizes; the file lands around 150KB.
const JPEG_QUALITY = "2";

export type ThumbnailResult = { buffer: Buffer; atSeconds: number };

// Grab one frame from the source and frame it the way the render would.
//
// The source stays in R2. `-ss` BEFORE `-i` on an http(s) input makes ffmpeg
// seek with HTTP range requests, so a two-hour film costs a few MB of transfer
// rather than the whole object -- downloading it the way the render does would
// make a button that draws a picture as expensive as a render.
//
// The frame runs through the render's own filter chain, so the thumbnail comes
// out at the output aspect ratio with the copyright-free zoom, mirror and colour
// already applied. A thumbnail that showed the raw source would advertise a
// video that does not look like it.
export async function grabMovieRecapThumbnail(
  project: MovieRecapProject,
  attempt: number,
  signal?: AbortSignal
): Promise<ThumbnailResult> {
  if (!project.sourceUrl) throw new Error("The source video is not ready.");
  const atSeconds = thumbnailTimeFor(project.sourceDurationSeconds, attempt);
  const dir = await mkdtemp(path.join(tmpdir(), "recap-thumb-"));
  try {
    const out = path.join(dir, "thumb.jpg");
    await execFileAsync(
      FFMPEG,
      [
        "-y",
        // Input-side seek: range requests, not a full download.
        "-ss", atSeconds.toFixed(3),
        "-i", project.sourceUrl,
        "-frames:v", "1",
        // Single still, not a numbered sequence — without this the image2 muxer
        // warns and the filename is treated as a pattern.
        "-update", "1",
        "-vf", buildShotFilter(shotFilterContext(project)),
        "-q:v", JPEG_QUALITY,
        out,
      ],
      { maxBuffer: 1024 * 1024 * 16, signal }
    );
    return { buffer: await readFile(out), atSeconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Upload the still and hand back the columns the row needs.
//
// The previous object is deleted after the new one is written, never before: a
// failed upload must leave the project with the thumbnail it already had. Every
// press otherwise leaves an orphan in the bucket, since the key is a fresh uuid.
export async function storeMovieRecapThumbnail(
  project: MovieRecapProject,
  result: ThumbnailResult,
  attempt: number
) {
  const objectKey = movieRecapObjectKey(project.id, "thumbnail", `thumbnail-${project.id}.jpg`);
  const url = await putObject(objectKey, result.buffer, "image/jpeg");
  if (project.thumbnailObjectKey && project.thumbnailObjectKey !== objectKey) {
    await deleteObject(project.thumbnailObjectKey).catch(() => {});
  }
  return {
    thumbnail_url: url,
    thumbnail_object_key: objectKey,
    thumbnail_at_seconds: result.atSeconds,
    thumbnail_attempt: attempt,
  };
}
