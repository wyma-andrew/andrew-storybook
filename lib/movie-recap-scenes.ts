import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describeMovieRecapScenes } from "./openai";

const execFileAsync = promisify(execFile);

// PySceneDetect lives in its own virtualenv rather than as a Node dependency —
// it is a Python tool, and the alternative (ffmpeg's `scdet`) handles slow
// dissolves and dark scenes noticeably worse. See README for the install.
const SCENEDETECT = process.env.SCENEDETECT_BIN || ".venv-scenedetect/bin/scenedetect";
// Cuts closer together than this are merged into the preceding scene: a recap
// beat is never half a second long, and one keyframe per flash-cut would blow
// the vision budget for no added information.
const MIN_SCENE_S = 2;
// What PySceneDetect is ASKED for, which is not the same thing. Detection runs
// fine and the merge above happens here, so the raw cut list survives: a
// "scene" of 2s+ built out of 0.8s pieces still contains those cuts, and a shot
// played across one shows the film's own edit inside what the planner thinks is
// a single unbroken 1.7s hold. Measured on a real export: 21 cuts in the
// finished video against 11 the planner made. The shot planner clamps its
// window to an uncut run, which it can only do if it is told where they are.
const RAW_MIN_SCENE_S = 0.8;
// Hard ceiling on scenes carried forward. A two-hour film detects ~2000 cuts;
// beyond a few hundred the extra keyframes cost time without telling the
// narration model anything new, so the longest scenes win (long scenes carry
// plot, quick cutaways rarely do).
const MAX_SCENES = 300;
// Frames go to the model at `detail: "low"` (~19 prompt tokens each), so the
// batch size here is about request size, not cost. Counted in SCENES, not
// frames, because a scene may now carry several: at 3 frames it is the same ~24
// images per request that 25 single-frame scenes used to be.
const VISION_BATCH_SCENES = 8;
const KEYFRAME_WIDTH = 512;
// Resolution of the motion track, in seconds per sample. Fine enough to tell a
// dead stretch from a moving one inside a 2s scene, coarse enough that a
// feature-length film is a few thousand numbers.
const MOTION_STEP_S = 0.25;

type Row = { start: number; end: number };

/**
 * How much the picture is moving, across the whole source. `values[i]` covers
 * `[i * stepS, (i + 1) * stepS)`.
 *
 * It costs nothing: PySceneDetect already decodes every frame to find cuts, and
 * `-s` makes it write the per-frame content values it computed on the way. A
 * separate ffmpeg pass for this would mean decoding a feature film twice.
 */
export type MotionTrack = { stepS: number; values: number[] };

// PySceneDetect's stats CSV: one row per frame, with a `content_val` column that
// is its frame-to-frame difference metric. Averaged into MOTION_STEP_S buckets.
function parseMotionCsv(csv: string): MotionTrack | null {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => line.startsWith("Frame Number"));
  if (headerIndex < 0) return null;
  const header = lines[headerIndex].split(",");
  const timecodeColumn = header.indexOf("Timecode");
  const valueColumn = header.indexOf("content_val");
  if (timecodeColumn < 0 || valueColumn < 0) return null;

  const sums: number[] = [];
  const counts: number[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(",");
    const seconds = parseTimecode(cells[timecodeColumn]);
    const value = Number(cells[valueColumn]);
    if (!Number.isFinite(seconds) || !Number.isFinite(value)) continue;
    const bucket = Math.floor(seconds / MOTION_STEP_S);
    sums[bucket] = (sums[bucket] ?? 0) + value;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  if (!counts.length) return null;
  const values = Array.from({ length: counts.length }, (_, i) => (counts[i] ? sums[i] / counts[i] : 0));
  return { stepS: MOTION_STEP_S, values };
}

function parseTimecode(value: string | undefined) {
  if (!value) return NaN;
  const parts = value.split(":").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return NaN;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// PySceneDetect's CSV has a "Timecode List:" preamble row, then a header row,
// then one row per scene. Columns 3 and 6 (0-based) are the start/end seconds.
function parseSceneCsv(csv: string): Row[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => line.startsWith("Scene Number"));
  if (headerIndex < 0) return [];
  return lines
    .slice(headerIndex + 1)
    .map((line) => line.split(","))
    .filter((cells) => cells.length >= 7)
    .map((cells) => ({ start: Number(cells[3]), end: Number(cells[6]) }))
    .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start);
}

// Merge away sub-MIN_SCENE_S scenes, then keep the longest MAX_SCENES and put
// them back in timeline order.
//
// The test is the merged scene's OWN LENGTH. It used to be `row.end -
// previous.start`, the span from where the previous scene began, which is not
// the same thing and let a scene through at well under the minimum. That was
// harmless while detection ran at `--min-scene-len 2s`, since every raw row
// already cleared the bar — and became a bug the moment RAW_MIN_SCENE_S dropped
// to 0.8s for cut-awareness. A 0.8s scene handed a 1.9s slot is 1.1s of cloned
// frames at the end of the shot, which is what "it freezes just before it cuts"
// was.
function condense(rows: Row[]): Row[] {
  const merged: Row[] = [];
  for (const row of rows) {
    const previous = merged[merged.length - 1];
    if (previous && previous.end - previous.start < MIN_SCENE_S) previous.end = row.end;
    else merged.push({ ...row });
  }
  // Nothing follows the last scene to merge into it, so a short one folds back.
  const last = merged[merged.length - 1];
  if (merged.length > 1 && last.end - last.start < MIN_SCENE_S) {
    merged.pop();
    merged[merged.length - 1].end = last.end;
  }
  if (merged.length <= MAX_SCENES) return merged;
  return [...merged]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, MAX_SCENES)
    .sort((a, b) => a.start - b.start);
}

export type DetectedScenes = {
  /** Merged, capped, model-facing scenes: one keyframe and one description each. */
  scenes: Row[];
  /** Every cut detection found, merged or not, in source seconds. */
  cuts: number[];
  /** Null when the stats file could not be read; planning then ignores motion. */
  motion: MotionTrack | null;
};

export async function detectScenes(videoPath: string, workDir: string, signal?: AbortSignal): Promise<DetectedScenes> {
  const outDir = path.join(workDir, "scenes");
  await execFileAsync(
    SCENEDETECT,
    ["-i", videoPath, "-o", outDir, "-s", "stats.csv",
     "detect-adaptive", "--min-scene-len", `${RAW_MIN_SCENE_S}s`, "list-scenes", "-f", "scenes.csv"],
    { maxBuffer: 1024 * 1024 * 64, signal }
  );
  const files = await readdir(outDir);
  const csvName = files.find((name) => name.endsWith(".csv"));
  if (!csvName) throw new Error("Scene detection produced no scene list.");
  const raw = parseSceneCsv(await readFile(path.join(outDir, csvName), "utf-8"));
  const scenes = condense(raw);
  if (!scenes.length) throw new Error("No scenes were detected in the source video.");
  // Interior boundaries only: where the first scene starts and the last one ends
  // are not cuts, they are the ends of the film.
  const cuts = raw.slice(1).map((row) => row.start);
  // Fails soft: a missing or unreadable stats file costs motion-aware framing,
  // not the render.
  let motion: MotionTrack | null = null;
  try {
    motion = parseMotionCsv(await readFile(path.join(outDir, "stats.csv"), "utf-8"));
  } catch {
    motion = null;
  }
  return { scenes, cuts, motion };
}

// Where a scene's frames are taken, as fractions of its length.
//
// ONE frame keeps the historical third-of-the-way-in position exactly: far
// enough past the cut to miss fades and motion blur, early enough to still be
// that scene's subject, and — because `focusWindow` anchors a shot on the
// described moment — a value that is recorded and load-bearing. Do not "tidy"
// it to 0.5.
//
// SEVERAL are spread evenly with a half-step inset at each end, so the first
// still clears the cut and the last stops short of the next one.
export const SINGLE_KEYFRAME_FRACTION = 1 / 3;
export function keyframeFractions(count: number) {
  if (count <= 1) return [SINGLE_KEYFRAME_FRACTION];
  return Array.from({ length: count }, (_, i) => (i + 0.5) / count);
}

// The frames the vision pass sees, per scene. `perScene` comes from the aspect
// ratio's pacing profile: 9:16 takes several so the model can describe an
// EVENT rather than a single moment, 16:9 takes one.
export async function extractKeyframes(
  ffmpeg: string,
  videoPath: string,
  rows: Row[],
  workDir: string,
  perScene = 1,
  signal?: AbortSignal
) {
  const fractions = keyframeFractions(perScene);
  const scenes: { index: number; files: string[]; fractions: number[] }[] = [];
  for (const [index, row] of rows.entries()) {
    const files: string[] = [];
    for (const [step, fraction] of fractions.entries()) {
      const at = row.start + (row.end - row.start) * fraction;
      const file = path.join(workDir, `scene-${index}-${step}.jpg`);
      // -ss before -i seeks by keyframe without decoding the file up to that
      // point; at hundreds of frames that difference is minutes, not seconds.
      await execFileAsync(
        ffmpeg,
        ["-y", "-ss", at.toFixed(3), "-i", videoPath, "-frames:v", "1", "-vf", `scale=${KEYFRAME_WIDTH}:-1`, "-q:v", "6", file],
        { maxBuffer: 1024 * 1024 * 16, signal }
      );
      files.push(file);
    }
    scenes.push({ index, files, fractions });
  }
  return scenes;
}

/**
 * What each scene looks like, and WHICH MOMENT of it matters.
 *
 * `keyframeFraction` is the second half and it is not cosmetic: `focusWindow`
 * plays the part of a scene the description came from, so with several frames
 * the model's own choice of peak decides where the shot sits. With one frame it
 * is the fixed third, exactly as before.
 */
export async function describeScenes(
  scenes: { index: number; files: string[]; fractions: number[] }[],
  signal: AbortSignal | undefined,
  onProgress?: (done: number, total: number) => PromiseLike<unknown>
): Promise<Map<number, { visual: string; keyframeFraction: number }>> {
  const described = new Map<number, { visual: string; keyframeFraction: number }>();
  for (let start = 0; start < scenes.length; start += VISION_BATCH_SCENES) {
    const batch = scenes.slice(start, start + VISION_BATCH_SCENES);
    const images = await Promise.all(
      batch.map(async (scene) => ({
        index: scene.index,
        frames: await Promise.all(scene.files.map(async (file) => (await readFile(file)).toString("base64"))),
      }))
    );
    for (const entry of await describeMovieRecapScenes(images, signal)) {
      const source = batch.find((scene) => scene.index === entry.sceneIndex);
      if (!source) continue;
      // An out-of-range peak means the model lost count, not that it meant the
      // last frame — fall back to the middle of what it was shown.
      const peak = source.fractions[entry.peakFrame] ?? source.fractions[Math.floor(source.fractions.length / 2)];
      described.set(entry.sceneIndex, { visual: entry.visual, keyframeFraction: peak });
    }
    await onProgress?.(Math.min(start + VISION_BATCH_SCENES, scenes.length), scenes.length);
  }
  return described;
}
