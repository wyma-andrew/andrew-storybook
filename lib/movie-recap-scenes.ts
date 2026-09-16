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
// Hard ceiling on scenes carried forward. A two-hour film detects ~2000 cuts;
// beyond a few hundred the extra keyframes cost time without telling the
// narration model anything new, so the longest scenes win (long scenes carry
// plot, quick cutaways rarely do).
const MAX_SCENES = 300;
// Frames go to the model at `detail: "low"` (~19 prompt tokens each), so the
// batch size here is about request size, not cost.
const VISION_BATCH = 25;
const KEYFRAME_WIDTH = 512;

type Row = { start: number; end: number };

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
function condense(rows: Row[]): Row[] {
  const merged: Row[] = [];
  for (const row of rows) {
    const previous = merged[merged.length - 1];
    if (previous && row.end - previous.start < MIN_SCENE_S) previous.end = row.end;
    else merged.push({ ...row });
  }
  if (merged.length <= MAX_SCENES) return merged;
  return [...merged]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, MAX_SCENES)
    .sort((a, b) => a.start - b.start);
}

export async function detectScenes(videoPath: string, workDir: string, signal?: AbortSignal): Promise<Row[]> {
  const outDir = path.join(workDir, "scenes");
  await execFileAsync(
    SCENEDETECT,
    ["-i", videoPath, "-o", outDir, "detect-adaptive", "--min-scene-len", `${MIN_SCENE_S}s`, "list-scenes", "-f", "scenes.csv"],
    { maxBuffer: 1024 * 1024 * 64, signal }
  );
  const files = await readdir(outDir);
  const csvName = files.find((name) => name.endsWith(".csv"));
  if (!csvName) throw new Error("Scene detection produced no scene list.");
  const rows = condense(parseSceneCsv(await readFile(path.join(outDir, csvName), "utf-8")));
  if (!rows.length) throw new Error("No scenes were detected in the source video.");
  return rows;
}

// One representative frame per scene, taken a third of the way in — far enough
// past the cut to miss fades and motion blur, early enough to still be that
// scene's subject.
export async function extractKeyframes(ffmpeg: string, videoPath: string, rows: Row[], workDir: string, signal?: AbortSignal) {
  const frames: { index: number; file: string }[] = [];
  for (const [index, row] of rows.entries()) {
    const at = row.start + (row.end - row.start) / 3;
    const file = path.join(workDir, `scene-${index}.jpg`);
    // -ss before -i seeks by keyframe without decoding the file up to that
    // point; at hundreds of frames that difference is minutes, not seconds.
    await execFileAsync(
      ffmpeg,
      ["-y", "-ss", at.toFixed(3), "-i", videoPath, "-frames:v", "1", "-vf", `scale=${KEYFRAME_WIDTH}:-1`, "-q:v", "6", file],
      { maxBuffer: 1024 * 1024 * 16, signal }
    );
    frames.push({ index, file });
  }
  return frames;
}

export async function describeScenes(
  frames: { index: number; file: string }[],
  signal: AbortSignal | undefined,
  onProgress?: (done: number, total: number) => PromiseLike<unknown>
): Promise<Map<number, string>> {
  const described = new Map<number, string>();
  for (let start = 0; start < frames.length; start += VISION_BATCH) {
    const batch = frames.slice(start, start + VISION_BATCH);
    const images = await Promise.all(
      batch.map(async (frame) => ({ index: frame.index, base64: (await readFile(frame.file)).toString("base64") }))
    );
    for (const entry of await describeMovieRecapScenes(images, signal)) {
      described.set(entry.sceneIndex, entry.visual);
    }
    await onProgress?.(Math.min(start + VISION_BATCH, frames.length), frames.length);
  }
  return described;
}
