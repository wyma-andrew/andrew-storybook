import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { ffprobeFor } from "./movie-recap-captions";

const execFileAsync = promisify(execFile);

// Vercel has no system ffmpeg; the static builds are the fallback there. See history/movie-recap.md.
export const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
export const FFPROBE = process.env.FFMPEG_PATH ? ffprobeFor(process.env.FFMPEG_PATH) : ffprobeStatic.path;

export async function run(cmd: string, args: string[], signal?: AbortSignal) {
  await execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 64, signal });
}

// Same call, but hands back what ffmpeg SAID. Several filters report their
// findings on stderr rather than producing output — `cropdetect` is one — so a
// caller that needs those has to read them.
export async function runReadingStderr(cmd: string, args: string[], signal?: AbortSignal) {
  const { stderr } = await execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 64, signal });
  return stderr;
}
