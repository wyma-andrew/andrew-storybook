import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MOVIE_RECAP_SUBTITLE_PRESETS } from "@/lib/constants/movie-recap";
import { FFMPEG } from "@/lib/movie-recap-ffmpeg";
import { ASS_FONT_SIZE_RATIO, subtitleFace, toAssColor } from "@/lib/movie-recap-render";
import { downloadObjectToFile, translateObjectKey, uploadFileToR2 } from "@/lib/r2";
import { translateBlurRadius, translateCues, type TranslateProject } from "@/lib/translate";

function assTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const secs = Math.floor(centiseconds / 100) % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

export type TranslateRenderRange = { start: number; end: number };

function buildAss(project: TranslateProject, width: number, height: number, range: TranslateRenderRange | null) {
  const style = MOVIE_RECAP_SUBTITLE_PRESETS[0];
  const face = subtitleFace(style.weight);
  const cssPx = height * project.subtitleSize / 100;
  const fontSize = Math.max(12, Math.round(cssPx * ASS_FONT_SIZE_RATIO));
  const x = Math.round(width / 2);
  const y = Math.round(height * project.subtitleY / 100);
  const outline = Math.max(1, Math.round(cssPx * style.outlineEm));
  const marginH = Math.round(width * 6 / 100);
  const color = toAssColor(style.color);
  const header = [
    "[Script Info]", "ScriptType: v4.00+", "WrapStyle: 0", "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`, `PlayResY: ${height}`, "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Text,${face.name},${fontSize},${color},${color},${toAssColor(style.outlineColor)},&HFF000000,${face.bold},0,0,0,100,100,0,0,1,${outline},0,2,${marginH},${marginH},0,1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const offset = range?.start ?? 0;
  const cues = range ? translateCues(project).filter((cue) => cue.end > range.start && cue.start < range.end) : translateCues(project);
  const events = cues.map((cue) => {
    const text = cue.text.replace(/[\\{}]/g, "").replace(/\n/g, "\\N");
    const start = Math.max(0, cue.start - offset);
    const end = (range ? Math.min(cue.end, range.end) : cue.end) - offset;
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Text,,0,0,0,,{\\an2\\pos(${x},${y})}${text}`;
  });
  return [...header, ...events].join("\n");
}

function videoFilter(project: TranslateProject, width: number, height: number, assPath: string) {
  const filters: string[] = [`[0:v]scale=${width}:${height}:flags=lanczos,setsar=1[v0]`];
  let current = "v0";
  for (const [index, rect] of project.blurRegions.entries()) {
    const x = Math.round(width * rect.x / 100);
    const y = Math.round(height * rect.y / 100);
    const w = Math.max(2, Math.min(width - x, Math.round(width * rect.width / 100)));
    const h = Math.max(2, Math.min(height - y, Math.round(height * rect.height / 100)));
    const radius = translateBlurRadius(rect, width, height);
    filters.push(`[${current}]split=2[keep${index}][crop${index}]`);
    filters.push(`[crop${index}]crop=${w}:${h}:${x}:${y},boxblur=${radius}:2[blur${index}]`);
    filters.push(`[keep${index}][blur${index}]overlay=${x}:${y}:shortest=1[v${index + 1}]`);
    current = `v${index + 1}`;
  }
  const escapedAss = assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  filters.push(`[${current}]ass='${escapedAss}'[out]`);
  return filters.join(";");
}

function runWithProgress(args: string[], duration: number, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, ["-progress", "pipe:1", "-nostats", ...args]);
    let stderr = "";
    let buffered = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/);
        if (match && duration > 0) onProgress(Math.min(1, Number(match[1]) / 1_000_000 / duration));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`)));
  });
}

export async function renderTranslateProject(project: TranslateProject, onProgress: (fraction: number) => void = () => undefined, range: TranslateRenderRange | null = null) {
  const workDir = await mkdtemp(path.join(tmpdir(), "translate-"));
  try {
    const sourcePath = path.join(workDir, "source-video");
    const assPath = path.join(workDir, "subtitles.ass");
    const outputPath = path.join(workDir, "translated.mp4");
    const width = Math.max(2, Math.floor(project.sourceWidth / 2) * 2);
    const height = Math.max(2, Math.floor(project.sourceHeight / 2) * 2);
    await downloadObjectToFile(project.sourceObjectKey, sourcePath);
    await writeFile(assPath, buildAss(project, width, height, range), "utf8");
    // -ss/-to before -i seek the input, so output timestamps (and the ASS events) start at 0.
    const trim = range ? ["-ss", range.start.toFixed(3), "-to", range.end.toFixed(3)] : [];
    await runWithProgress([
      "-y", ...trim, "-i", sourcePath,
      "-filter_complex", videoFilter(project, width, height, assPath),
      "-map", "[out]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
    ], range ? range.end - range.start : project.sourceDurationSeconds, (fraction) => onProgress(0.02 + fraction * 0.93));
    onProgress(0.95);
    const fileName = range ? `translated-${Math.round(range.start * 1000)}-${Math.round(range.end * 1000)}.mp4` : "translated.mp4";
    const objectKey = translateObjectKey(project.id, "render", fileName);
    const url = await uploadFileToR2(objectKey, outputPath, "video/mp4");
    return { objectKey, url };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
