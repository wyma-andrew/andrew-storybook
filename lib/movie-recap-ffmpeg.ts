import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

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
