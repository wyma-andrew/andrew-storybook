import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MOVIE_RECAP_SUBTITLE_PRESETS, MOVIE_RECAP_TARGET_DIMENSIONS } from "./constants/movie-recap";
import { mapConcurrent } from "./map-concurrent";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { narrationHash } from "./movie-recap-narration";
import { ASS_FONT_SIZE_RATIO, subtitleFace, toAssColor } from "./movie-recap-render";
import { buildShotFilter } from "./movie-recap-transform";
import { downloadObjectToFile, getObjectBytes, putObject, recapV2NarrationKey, recapV2ObjectKey, uploadFileToR2 } from "./r2";
import { recapV2CaptionChunks, type RecapV2Project, type RecapV2Unit } from "./recap-v2";
import { captionTimes, pcmToWav, shortPauseBounds } from "./recap-v2-audio";
import { translateBlurRadius } from "./translate";
import { synthesize } from "./tts/synthesize";
import { resolveMovieRecapVoice } from "./tts/voices";

const FPS = 30;
const SAMPLE_RATE = 24_000;
// recap-en-to-mm's `max_video_speed`. Past it the window's tail is cut, as the
// tool does; Short pauses keeps enough of the clip's own silence to avoid that
// where the raw clip allows.
export const RECAP_V2_MAX_VIDEO_SPEED = 1.25;

export type RecapV2RenderProgress = (stage: string, fraction: number | null) => void;

export type RecapV2TimedUnit = { unit: RecapV2Unit; windowS: number; audioS: number; audioStart: number; frames: number };

// Narration leads; each window's picture is retimed to its line. Frame counts
// are cumulative off the narration clock, so hundreds of units stay within half
// a frame of the audio instead of each rounding up on its own.
export function planRecapV2Timeline(units: RecapV2Unit[], audioS: number[]): RecapV2TimedUnit[] {
  let audioCursor = 0;
  let framesDone = 0;
  return units.map((unit, index) => {
    const windowS = Math.max(1 / FPS, unit.videoEnd - unit.videoStart);
    const audioStart = audioCursor;
    audioCursor += audioS[index];
    const frames = Math.max(1, Math.round(audioCursor * FPS) - framesDone);
    framesDone += frames;
    return { unit, windowS, audioS: audioS[index], audioStart, frames };
  });
}

// recap-en-to-mm's `_sync_filter` with its freeze fallback off (its default):
// exact retime to the narration, except past max speed, where the picture
// plays at max speed and the rest of the window is cut.
export function recapV2SyncFilter(windowS: number, targetS: number) {
  const desired = targetS / windowS;
  const minFactor = 1 / RECAP_V2_MAX_VIDEO_SPEED;
  if (desired < minFactor) {
    return `setpts=${minFactor.toFixed(9)}*(PTS-STARTPTS),trim=duration=${targetS.toFixed(6)},setpts=PTS-STARTPTS,fps=${FPS}`;
  }
  return `setpts=${desired.toFixed(9)}*(PTS-STARTPTS),fps=${FPS}`;
}

// The cached clip is the voice's raw output, as 24kHz mono PCM, so Short pauses
// can be switched without synthesizing again.
async function rawClip(project: RecapV2Project, text: string, slot: number, workDir: string, signal?: AbortSignal) {
  const voice = resolveMovieRecapVoice(project.voiceId);
  // recap-en-to-mm speaks at Edge TTS's default +0%, and Edge's Thiha/Nilar are
  // the same Microsoft neural voices, so Azure's catalog +20% is overridden here.
  const rate = voice.providerId === "azure" ? "+0%" : undefined;
  const key = recapV2NarrationKey(project.id, `raw-${narrationHash(voice, text, rate)}`);
  const cached = await getObjectBytes(key);
  let wav = cached;
  if (!wav) {
    const result = await synthesize({ text, voice, rate, signal });
    const inPath = path.join(workDir, `tts-${slot}`);
    const pcmPath = path.join(workDir, `tts-${slot}.pcm`);
    await writeFile(inPath, result.audio);
    await run(FFMPEG, ["-y", "-i", inPath, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", pcmPath], signal);
    const pcm = await readFile(/* turbopackIgnore: true */ pcmPath);
    wav = pcmToWav(new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2)), SAMPLE_RATE);
    await putObject(key, wav, "audio/wav");
  }
  const data = wav.subarray(44);
  return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength - (data.byteLength % 2)));
}

function blurGraph(project: RecapV2Project, input: string) {
  const width = project.sourceWidth;
  const height = project.sourceHeight;
  const filters: string[] = [];
  let current = input;
  project.blurRegions.forEach((rect, index) => {
    const x = Math.round(width * rect.x / 100);
    const y = Math.round(height * rect.y / 100);
    const w = Math.max(2, Math.min(width - x, Math.round(width * rect.width / 100)));
    const h = Math.max(2, Math.min(height - y, Math.round(height * rect.height / 100)));
    filters.push(`[${current}]split=2[k${index}][c${index}]`);
    filters.push(`[c${index}]crop=${w}:${h}:${x}:${y},boxblur=${translateBlurRadius(rect, width, height)}:2[b${index}]`);
    filters.push(`[k${index}][b${index}]overlay=${x}:${y}[v${index}]`);
    current = `v${index}`;
  });
  return { filters, output: current };
}

// Blur runs on the source frame, before framing and mirroring, so a box drawn
// over the source's burned-in subtitles covers them whatever the output shape.
export function recapV2PartFilter(project: RecapV2Project, windowS: number, targetS: number) {
  const blur = blurGraph(project, "t");
  const shot = buildShotFilter({
    aspectRatio: project.aspectRatio,
    fitMode: project.fitMode,
    dynamicBackgroundBlurEnabled: true,
    mirrorEnabled: project.mirror,
    zoom: project.zoom,
  });
  return [
    `[0:v]${recapV2SyncFilter(windowS, targetS)}[t]`,
    ...blur.filters,
    `[${blur.output}]${shot},tpad=stop_mode=clone:stop_duration=0.5[out]`,
  ].join(";");
}

function assTime(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function buildAss(project: RecapV2Project, timeline: RecapV2TimedUnit[], clips: Int16Array[]) {
  const [width, height] = MOVIE_RECAP_TARGET_DIMENSIONS[project.aspectRatio];
  const style = MOVIE_RECAP_SUBTITLE_PRESETS[0];
  const face = subtitleFace(style.weight);
  const cssPx = height * project.subtitleSize / 100;
  const fontSize = Math.max(12, Math.round(cssPx * ASS_FONT_SIZE_RATIO));
  const outline = Math.max(1, Math.round(cssPx * style.outlineEm));
  const marginH = Math.round(width * 6 / 100);
  const color = toAssColor(style.color);
  const x = Math.round(width / 2);
  const y = Math.round(height * project.subtitleY / 100);
  return [
    "[Script Info]", "ScriptType: v4.00+", "WrapStyle: 0", "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`, `PlayResY: ${height}`, "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Text,${face.name},${fontSize},${color},${color},${toAssColor(style.outlineColor)},&HFF000000,${face.bold},0,0,0,100,100,0,0,1,${outline},0,2,${marginH},${marginH},0,1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...timeline.flatMap(({ unit, audioStart }, index) => {
      if (unit.muted) return [];
      const chunks = recapV2CaptionChunks(unit.text);
      const times = captionTimes(clips[index], SAMPLE_RATE, chunks.map((chunk) => chunk.length));
      return chunks.map((chunk, k) => {
        const start = audioStart + times.starts[k];
        const end = audioStart + (times.starts[k + 1] ?? times.end);
        return `Dialogue: 0,${assTime(start)},${assTime(end)},Text,,0,0,0,,{\\an2\\pos(${x},${y})}${chunk.replace(/[\\{}]/g, "")}`;
      });
    }),
  ].join("\n");
}

const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS)];

export async function renderRecapV2(project: RecapV2Project, onProgress: RecapV2RenderProgress, signal?: AbortSignal) {
  const workDir = await mkdtemp(path.join(tmpdir(), "recap-v2-"));
  try {
    onProgress("Downloading source", 0);
    const sourcePath = path.join(workDir, "source");
    await downloadObjectToFile(project.sourceObjectKey, sourcePath, {
      signal,
      onProgress: (done, total) => onProgress("Downloading source", total ? 0.05 * done / total : null),
    });

    const units = project.units;
    let spoken = 0;
    const clips = await mapConcurrent(units, 4, async (unit, index) => {
      const clip = unit.muted
        ? new Int16Array(Math.round((unit.videoEnd - unit.videoStart) * SAMPLE_RATE))
        : await rawClip(project, unit.text, index, workDir, signal);
      onProgress(`Narration ${++spoken}/${units.length}`, 0.05 + 0.25 * spoken / units.length);
      return clip;
    });
    const parts = clips.map((clip, index) => {
      if (!project.shortPauses || units[index].muted) return clip;
      const windowS = units[index].videoEnd - units[index].videoStart;
      const { first, last } = shortPauseBounds(clip, SAMPLE_RATE, windowS / RECAP_V2_MAX_VIDEO_SPEED);
      return clip.subarray(first, last);
    });
    const timeline = planRecapV2Timeline(units, parts.map((part) => part.length / SAMPLE_RATE));
    const narration = new Int16Array(parts.reduce((sum, part) => sum + part.length, 0));
    parts.reduce((offset, part) => { narration.set(part, offset); return offset + part.length; }, 0);
    const narrationPath = path.join(workDir, "narration.wav");
    await writeFile(narrationPath, pcmToWav(narration, SAMPLE_RATE));

    let rendered = 0;
    const videoParts = await mapConcurrent(timeline, 3, async (item, index) => {
      const out = path.join(workDir, `part-${String(index).padStart(5, "0")}.mp4`);
      await run(FFMPEG, [
        "-y", "-ss", item.unit.videoStart.toFixed(6), "-t", item.windowS.toFixed(6), "-i", sourcePath, "-an",
        "-filter_complex", recapV2PartFilter(project, item.windowS, item.audioS), "-map", "[out]",
        "-frames:v", String(item.frames), ...ENCODE, out,
      ], signal);
      onProgress(`Picture ${++rendered}/${timeline.length}`, 0.3 + 0.6 * rendered / timeline.length);
      return out;
    });
    const videoList = path.join(workDir, "video.txt");
    const footagePath = path.join(workDir, "footage.mp4");
    await writeFile(videoList, videoParts.map((file) => `file '${file}'`).join("\n"));
    onProgress("Joining picture", null);
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", videoList, "-c", "copy", footagePath], signal);

    onProgress(project.subtitlesEnabled ? "Burning captions and narration" : "Adding narration", null);
    const outputPath = path.join(workDir, "recap.mp4");
    const audioArgs = ["-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart"];
    if (project.subtitlesEnabled) {
      const assPath = path.join(workDir, "captions.ass");
      await writeFile(assPath, buildAss(project, timeline, parts), "utf8");
      const escaped = assPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
      await run(FFMPEG, ["-y", "-i", footagePath, "-i", narrationPath, "-filter_complex", `[0:v]ass='${escaped}'[v]`,
        "-map", "[v]", ...ENCODE, ...audioArgs, outputPath], signal);
    } else {
      await run(FFMPEG, ["-y", "-i", footagePath, "-i", narrationPath, "-map", "0:v", "-c:v", "copy", ...audioArgs, outputPath], signal);
    }

    onProgress("Uploading", null);
    const objectKey = recapV2ObjectKey(project.id, "render", `${project.name.replace(/\.[^.]+$/, "")}-recap.mp4`);
    const url = await uploadFileToR2(objectKey, outputPath, "video/mp4");
    return { objectKey, url };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
