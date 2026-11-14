import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { FFMPEG, FFPROBE, run } from "./movie-recap-ffmpeg";
import { ASS_FONT_SIZE_RATIO, subtitleFace } from "./movie-recap-render";
import { deletePrefix, downloadObjectToFile, splitterObjectKey, splitterPartsPrefix, uploadFileToR2 } from "./r2";
import { LEVEL_FRAME_S, planSplitterParts, splitterPartLabel, type SplitterPart, type SplitterProject } from "./splitter";
import { framingFilter, outputFrameSize } from "./video-framing";

const execFileAsync = promisify(execFile);
const LEVEL_RATE = 8000;

export type SplitterProgressFn = (stage: string, fraction: number | null) => void;

async function hasAudio(sourcePath: string, signal?: AbortSignal) {
  const { stdout } = await execFileAsync(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", sourcePath], { signal });
  return Boolean(stdout.trim());
}

// Loudness (dBFS) of every 50ms of the sound, read at 8kHz mono: enough to
// hear where speech stops.
async function audioLevels(sourcePath: string, workDir: string, signal?: AbortSignal) {
  const pcmPath = path.join(workDir, "levels.pcm");
  await run(FFMPEG, ["-y", "-v", "error", "-i", sourcePath, "-vn", "-ac", "1", "-ar", String(LEVEL_RATE), "-f", "s16le", pcmPath], signal);
  const pcm = await readFile(/* turbopackIgnore: true */ pcmPath);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const hop = LEVEL_RATE * LEVEL_FRAME_S;
  const levels = new Float32Array(Math.floor(samples.length / hop));
  for (let frame = 0; frame < levels.length; frame++) {
    let sum = 0;
    for (let i = frame * hop; i < (frame + 1) * hop; i++) sum += (samples[i] / 32768) ** 2;
    levels[frame] = 10 * Math.log10(sum / hop + 1e-10);
  }
  return levels;
}

async function planFor(project: SplitterProject, sourcePath: string, workDir: string, onProgress: SplitterProgressFn, signal?: AbortSignal) {
  const sound = await hasAudio(sourcePath, signal);
  let levels: Float32Array | null = null;
  if (project.smartCut && sound) {
    onProgress("Reading the sound to find the pauses", null);
    levels = await audioLevels(sourcePath, workDir, signal);
  }
  const parts = planSplitterParts(project.sourceDurationSeconds, project.partMinutes * 60, { smart: project.smartCut, maxExtraS: project.smartCutSeconds, levels });
  return { parts, sound };
}

async function download(project: SplitterProject, workDir: string, onProgress: SplitterProgressFn, signal?: AbortSignal) {
  const sourcePath = path.join(workDir, "source");
  await downloadObjectToFile(project.sourceObjectKey, sourcePath, {
    signal,
    onProgress: (done, total) => onProgress("Downloading source", total ? 0.1 * done / total : null),
  });
  return sourcePath;
}

// "Check cuts": where the video will be cut, without rendering.
export async function planSplitter(project: SplitterProject, onProgress: SplitterProgressFn, signal?: AbortSignal) {
  const workDir = await mkdtemp(path.join(tmpdir(), "splitter-"));
  try {
    const sourcePath = await download(project, workDir, onProgress, signal);
    return (await planFor(project, sourcePath, workDir, onProgress, signal)).parts;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function assTime(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

// The tool's text PNGs (white, black outline, optional dark rounded box) as
// libass styles: libass shapes Burmese, and BorderStyle 3 is the box.
function textStyle(name: string, sizePercent: number, opacity: number, box: boolean, height: number) {
  const face = subtitleFace(700);
  const cssPx = height * sizePercent / 100;
  const fontSize = Math.max(10, Math.round(cssPx * ASS_FONT_SIZE_RATIO));
  const alpha = Math.round(255 - opacity * 255).toString(16).padStart(2, "0").toUpperCase();
  const boxAlpha = Math.round(255 - opacity * 120).toString(16).padStart(2, "0").toUpperCase();
  const outline = box ? Math.max(4, Math.round(cssPx * 0.3)) : Math.max(1, Math.round(cssPx * 0.08));
  return `Style: ${name},${face.name},${fontSize},&H${alpha}FFFFFF,&H${alpha}FFFFFF,&H${box ? boxAlpha : alpha}000000,&H${boxAlpha}000000,${face.bold},0,0,0,100,100,0,0,${box ? 3 : 1},${outline},0,5,0,0,0,1`;
}

function partAss(project: SplitterProject, label: string, lengthS: number, width: number, height: number) {
  const event = (style: string, text: string, x: number, y: number) =>
    `Dialogue: 0,${assTime(0)},${assTime(lengthS + 1)},${style},,0,0,0,,{\\an5\\pos(${Math.round(width * x / 100)},${Math.round(height * y / 100)})}${text.replace(/[\\{}]/g, "").replace(/\n/g, "\\N")}`;
  return [
    "[Script Info]", "ScriptType: v4.00+", "WrapStyle: 0", "ScaledBorderAndShadow: yes", `PlayResX: ${width}`, `PlayResY: ${height}`, "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    textStyle("Text", project.textSize, project.textOpacity, project.textBox, height),
    textStyle("Part", project.partNumberSize, 1, project.textBox, height),
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...(project.textValue.trim() ? [event("Text", project.textValue.trim(), project.textX, project.textY)] : []),
    ...(label ? [event("Part", label, project.partNumberX, project.partNumberY)] : []),
  ].join("\n");
}

function encodeArgs(quality: SplitterProject["quality"]) {
  return quality === "480" ? ["-c:v", "libx264", "-preset", "superfast", "-crf", "23"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];
}

// Every part is re-encoded, so cuts land exactly on the planned time (stream
// copy would jump to key frames).
export async function renderSplitter(project: SplitterProject, onProgress: SplitterProgressFn, signal?: AbortSignal) {
  const workDir = await mkdtemp(path.join(tmpdir(), "splitter-"));
  try {
    const sourcePath = await download(project, workDir, onProgress, signal);
    const { parts, sound } = await planFor(project, sourcePath, workDir, onProgress, signal);
    const [width, height] = outputFrameSize({ ratio: project.aspectRatio, quality: project.quality, sourceWidth: project.sourceWidth, sourceHeight: project.sourceHeight });
    const frame = framingFilter({ width, height, fill: project.aspectRatio === "original" ? "bars" : project.fitMode });
    await deletePrefix(splitterPartsPrefix(project.id));
    const base = project.name.replace(/\.[^.]+$/, "");
    const done: SplitterPart[] = [];
    for (const part of parts) {
      const length = part.end - part.start;
      const label = project.partNumberEnabled ? splitterPartLabel(project.partNumberTemplate, part.n, parts.length) : "";
      const assPath = path.join(workDir, `part-${part.n}.ass`);
      await writeFile(assPath, partAss(project, label, length, width, height), "utf8");
      const escaped = assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
      const out = path.join(workDir, `part-${part.n}.mp4`);
      onProgress(`Part ${part.n}/${parts.length}`, 0.1 + 0.85 * (part.start / project.sourceDurationSeconds));
      await run(FFMPEG, [
        "-y", "-ss", part.start.toFixed(3), "-t", Math.max(0.05, length).toFixed(3), "-i", sourcePath,
        "-filter_complex", `[0:v]${frame},ass='${escaped}',format=yuv420p[v]`, "-map", "[v]",
        ...(sound ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        ...encodeArgs(project.quality), "-movflags", "+faststart", out,
      ], signal);
      const objectKey = splitterObjectKey(project.id, `${base}_part_${String(part.n).padStart(2, "0")}.mp4`);
      const url = await uploadFileToR2(objectKey, out, "video/mp4");
      await rm(out, { force: true });
      done.push({ ...part, objectKey, url });
    }
    return done;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
