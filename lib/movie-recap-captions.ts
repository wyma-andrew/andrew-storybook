import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { TranscriptSegment } from "./openai";

const execFileAsync = promisify(execFile);

// Reading the source's own subtitle track instead of transcribing it. When a
// source carries one, it is better than Whisper on every axis: exact wording,
// exact timings, no API call, no upload limit, no minutes of waiting.
//
// It is an OPTIMISATION, never a replacement. Most sources have no subtitle
// stream at all — a download or a cutter export usually strips it — so every
// path here fails soft and leaves the render to transcribe as before.

// Codecs that carry TEXT. The others (dvd_subtitle, hdmv_pgs_subtitle,
// dvb_subtitle) are bitmaps — pictures of words, which ffmpeg cannot convert to
// text and which would need OCR. Burned-in subtitles are not a stream at all and
// cannot be detected here.
const TEXT_SUBTITLE_CODECS = new Set(["subrip", "srt", "mov_text", "ass", "ssa", "webvtt", "text"]);

// Below these, the track is assumed not to be a dialogue track and the render
// transcribes instead. A forced track — subtitles for the one alien language in
// an English film — covers a few percent of the runtime, and using it as "the
// dialogue" would tell the narration model almost nothing while looking like it
// had worked.
const MIN_USABLE_CUES = 10;
const MIN_USABLE_COVERAGE = 0.05;

export type CaptionStream = { index: number; codec: string; language: string | null };

type ProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  tags?: { language?: string };
  disposition?: Record<string, number>;
};

// ffprobe ships beside ffmpeg in every build, and FFMPEG_PATH may point at a
// keg-only install that is not on PATH — so resolve it next to the binary we
// were given rather than hoping for a bare `ffprobe`.
export function ffprobeFor(ffmpeg: string) {
  if (!ffmpeg.includes(path.sep)) return "ffprobe";
  return path.join(path.dirname(ffmpeg), "ffprobe");
}

// Which subtitle stream to read, or null for "transcribe instead".
//
// Forced tracks are skipped outright: they exist to translate isolated foreign
// lines, so they are not the film's dialogue. Otherwise a stream marked default
// wins, then the first text stream — the order a player would pick in.
export function pickCaptionStream(streams: ProbeStream[]): CaptionStream | null {
  const text = streams.filter(
    (stream) =>
      stream.codec_type === "subtitle" &&
      typeof stream.codec_name === "string" &&
      TEXT_SUBTITLE_CODECS.has(stream.codec_name) &&
      !stream.disposition?.forced
  );
  if (!text.length) return null;
  const chosen = text.find((stream) => stream.disposition?.default) ?? text[0];
  return {
    index: chosen.index ?? 0,
    codec: chosen.codec_name ?? "",
    language: chosen.tags?.language ?? null,
  };
}

// Cue text as the narration model should see it: words only.
//
// Strips ASS override blocks ({\an8}, {\pos(..)}) and the HTML-ish tags SRT
// carries (<i>, <font ...>), because they are styling instructions that would
// otherwise reach the model as if they were dialogue. Line breaks inside a cue
// become spaces — they are typesetting, not sentence structure.
export function cleanCueText(raw: string) {
  return raw
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function timestampToSeconds(value: string) {
  // SRT writes 00:01:02,500; WebVTT writes 00:01:02.500 and may drop the hour.
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, millis] = match;
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, "0")) / 1000
  );
}

// SRT into the same shape Whisper's segments arrive in, so nothing downstream
// can tell the difference.
export function parseSrt(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const block of content.replace(/\r\n/g, "\n").trim().split(/\n{2,}/)) {
    const lines = block.split("\n");
    const arrowIndex = lines.findIndex((line) => line.includes("-->"));
    if (arrowIndex === -1) continue;
    const [from, to] = lines[arrowIndex].split("-->");
    const start = timestampToSeconds(from ?? "");
    const end = timestampToSeconds(to ?? "");
    // A cue whose timing will not parse is dropped rather than guessed at: a
    // wrong timestamp silently attaches dialogue to the wrong scene.
    if (start === null || end === null || end <= start) continue;
    const text = cleanCueText(lines.slice(arrowIndex + 1).join(" "));
    if (text) segments.push({ start, end, text });
  }
  return segments;
}

// Whether what came out is worth using instead of transcribing.
export function captionsLookUsable(segments: TranscriptSegment[], sourceDurationS: number) {
  if (segments.length < MIN_USABLE_CUES) return false;
  if (!Number.isFinite(sourceDurationS) || sourceDurationS <= 0) return false;
  const covered = segments.reduce((total, cue) => total + (cue.end - cue.start), 0);
  return covered / sourceDurationS >= MIN_USABLE_COVERAGE;
}

// The whole attempt, start to finish. Returns null whenever captions cannot be
// used, for any reason, and never throws — a source with no usable subtitles is
// the normal case, not an error, and the render transcribes instead.
export async function readSourceCaptions(
  ffmpeg: string,
  sourcePath: string,
  workDir: string,
  sourceDurationS: number,
  signal?: AbortSignal
): Promise<{ segments: TranscriptSegment[]; stream: CaptionStream } | null> {
  try {
    const { stdout } = await execFileAsync(
      ffprobeFor(ffmpeg),
      ["-v", "error", "-select_streams", "s", "-show_streams", "-of", "json", sourcePath],
      { maxBuffer: 1024 * 1024 * 16, signal }
    );
    const stream = pickCaptionStream((JSON.parse(stdout) as { streams?: ProbeStream[] }).streams ?? []);
    if (!stream) return null;

    // Converted to SRT rather than parsed in place, so one parser covers every
    // text codec ffmpeg can read.
    const srtPath = path.join(workDir, "captions.srt");
    await execFileAsync(
      ffmpeg,
      ["-y", "-loglevel", "error", "-i", sourcePath, "-map", `0:${stream.index}`, "-c:s", "srt", srtPath],
      { maxBuffer: 1024 * 1024 * 64, signal }
    );
    const segments = parseSrt(await readFile(srtPath, "utf8"));
    if (!captionsLookUsable(segments, sourceDurationS)) return null;
    return { segments, stream };
  } catch {
    return null;
  }
}
