import type { FrameFill, FrameQuality, FrameRatio } from "./video-framing";

// recap-en-to-mm's Splitter tab (splitter.py): one video into parts of N
// minutes; a smart cut waits for the next pause so no sentence is cut in two.
// See history/splitter.md.

export type SplitterCut = "exact" | "pause" | "breath" | "quietest" | "end";
export type SplitterPart = { n: number; start: number; end: number; cut: SplitterCut; url?: string; objectKey?: string };

export type SplitterProject = {
  id: string;
  name: string;
  sourceFileName: string;
  sourceUrl: string | null;
  sourceObjectKey: string;
  sourceContentType: string;
  sourceSizeBytes: number;
  sourceDurationSeconds: number;
  sourceLastModified: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceUploadStatus: "pending" | "uploading" | "ready" | "failed";
  partMinutes: number;
  smartCut: boolean;
  smartCutSeconds: number;
  aspectRatio: FrameRatio;
  fitMode: FrameFill;
  quality: FrameQuality;
  textValue: string;
  textSize: number;
  textOpacity: number;
  textBox: boolean;
  textX: number;
  textY: number;
  partNumberEnabled: boolean;
  partNumberTemplate: string;
  partNumberSize: number;
  partNumberX: number;
  partNumberY: number;
  parts: SplitterPart[];
  jobStatus: "idle" | "running" | "done" | "failed";
  jobStage: string | null;
  jobProgress: number | null;
  jobError: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SPLITTER_SETTING_KEYS = [
  "partMinutes", "smartCut", "smartCutSeconds", "aspectRatio", "fitMode", "quality", "textValue", "textSize", "textOpacity",
  "textBox", "textX", "textY", "partNumberEnabled", "partNumberTemplate", "partNumberSize", "partNumberX", "partNumberY",
] as const;

export type SplitterPatch = Partial<Pick<SplitterProject, "name" | (typeof SPLITTER_SETTING_KEYS)[number]>>;

export type SplitterListItem = Pick<SplitterProject, "id" | "name" | "sourceFileName" | "sourceDurationSeconds" | "sourceUploadStatus" | "updatedAt"> & { partCount: number };

export const SPLITTER_LIST_COLUMNS = "id,name,source_file_name,source_duration_seconds,source_upload_status,updated_at,parts";

export type SplitterProgress = Pick<SplitterProject, "jobStatus" | "jobStage" | "jobProgress" | "updatedAt">;

export const SPLITTER_PROGRESS_COLUMNS = "job_status,job_stage,job_progress,updated_at";

export const SPLITTER_STALE_JOB_MS = 2 * 60 * 60 * 1000;

export function splitterJobRunning(row: { job_status: unknown; updated_at: unknown }) {
  return row.job_status === "running" && Date.now() - Date.parse(String(row.updated_at)) < SPLITTER_STALE_JOB_MS;
}

export function mapSplitterProgress(row: Record<string, unknown>): SplitterProgress {
  return {
    jobStatus: row.job_status as SplitterProject["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    jobProgress: row.job_progress == null ? null : Number(row.job_progress),
    updatedAt: row.updated_at as string,
  };
}

export function mapSplitterListItem(row: Record<string, unknown>): SplitterListItem {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceUploadStatus: row.source_upload_status as SplitterProject["sourceUploadStatus"],
    updatedAt: row.updated_at as string,
    partCount: ((row.parts as SplitterPart[]) ?? []).filter((part) => part.url).length,
  };
}

export function mapSplitterProject(row: Record<string, unknown>): SplitterProject {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceUrl: (row.source_url as string) ?? null,
    sourceObjectKey: row.source_object_key as string,
    sourceContentType: row.source_content_type as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceLastModified: Number(row.source_last_modified),
    sourceWidth: Number(row.source_width),
    sourceHeight: Number(row.source_height),
    sourceUploadStatus: row.source_upload_status as SplitterProject["sourceUploadStatus"],
    partMinutes: Number(row.part_minutes),
    smartCut: row.smart_cut !== false,
    smartCutSeconds: Number(row.smart_cut_seconds),
    aspectRatio: row.aspect_ratio as FrameRatio,
    fitMode: row.fit_mode as FrameFill,
    quality: row.quality as FrameQuality,
    textValue: (row.text_value as string) ?? "",
    textSize: Number(row.text_size),
    textOpacity: Number(row.text_opacity),
    textBox: Boolean(row.text_box),
    textX: Number(row.text_x),
    textY: Number(row.text_y),
    partNumberEnabled: row.part_number_enabled !== false,
    partNumberTemplate: (row.part_number_template as string) ?? "Part {n}/{total}",
    partNumberSize: Number(row.part_number_size),
    partNumberX: Number(row.part_number_x),
    partNumberY: Number(row.part_number_y),
    parts: (row.parts as SplitterPart[]) ?? [],
    jobStatus: row.job_status as SplitterProject["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    jobProgress: row.job_progress == null ? null : Number(row.job_progress),
    jobError: (row.job_error as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
const myanmarDigits = (value: number) => String(value).replace(/\d/g, (digit) => MM_DIGITS[Number(digit)]);

// "{n}" 1 2 3, "{mm}" ၁ ၂ ၃, "{total}" the part count — in Myanmar digits too
// when the label uses {mm}, so "အပိုင်း {mm}/{total}" reads ၂/၅, not ၂/5.
export function splitterPartLabel(template: string, n: number, total: number) {
  const mm = template.includes("{mm}");
  return template.replaceAll("{n}", String(n)).replaceAll("{mm}", myanmarDigits(n))
    .replaceAll("{total}", mm ? myanmarDigits(total) : String(total)).trim();
}

export const LEVEL_FRAME_S = 0.05;
const PAUSE_BELOW_SPEECH_DB = 18;
const PAUSE_ABOVE_FLOOR_DB = 6;
const GOOD_PAUSE_S = 0.3;
const MIN_TAIL_S = 20;

function percentile(values: ArrayLike<number>, p: number) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const rank = (sorted.length - 1) * p / 100;
  const low = Math.floor(rank);
  return sorted[low] + (sorted[Math.min(sorted.length - 1, low + 1)] - sorted[low]) * (rank - low);
}

// How loud this video's speech is: the 90th percentile of its sounding frames.
export function speechLevel(levels: Float32Array) {
  const sounding = Array.from(levels).filter((level) => level > -70);
  return sounding.length ? percentile(sounding, 90) : -20;
}

// Where to cut between `start` (the part's time is up) and `end` (start + the
// extra seconds allowed). A pause already running through `start` is taken;
// otherwise the earliest of the longest pauses before `end` — the likeliest
// end of a sentence; with no pause at all (music, shouting), the quietest moment.
export function quietPoint(levels: Float32Array, start: number, end: number, speechDb: number): [number, SplitterCut] {
  const i0 = Math.max(0, Math.round(start / LEVEL_FRAME_S));
  const i1 = Math.min(levels.length - 1, Math.round(end / LEVEL_FRAME_S));
  if (i1 <= i0) return [start, "exact"];
  const floor = percentile(levels.subarray(i0, i1 + 1), 10);
  const limit = Math.max(speechDb - PAUSE_BELOW_SPEECH_DB, floor + PAUSE_ABOVE_FLOOR_DB);
  const quiet = (i: number) => levels[i] <= limit;
  const lo = Math.max(0, i0 - Math.round(3 / LEVEL_FRAME_S));
  const hi = Math.min(levels.length - 1, i1 + Math.round(3 / LEVEL_FRAME_S));
  const runs: [number, number][] = [];
  for (let i = lo; i <= hi;) {
    if (!quiet(i)) { i++; continue; }
    let b = i;
    // One loud 50ms blip is no end to a pause.
    while (b + 1 <= hi && (quiet(b + 1) || (b + 2 <= hi && quiet(b + 2)))) b++;
    runs.push([i, b]);
    i = b + 1;
  }
  const good = Math.round(GOOD_PAUSE_S / LEVEL_FRAME_S);
  const round3 = (value: number) => Math.round(value * 1000) / 1000;
  const middle = (a: number, b: number) => round3(((Math.max(a, i0) + b) / 2 + 0.5) * LEVEL_FRAME_S);
  for (const [a, b] of runs) {
    if (a <= i0 && i0 <= b && b - a + 1 >= good && b - i0 >= 3) return [middle(a, b), "pause"];
  }
  const later = runs.filter(([a]) => i0 <= a && a <= i1);
  if (later.length) {
    const longest = Math.max(...later.map(([a, b]) => b - a + 1));
    if (longest >= 2) {
      const [a, b] = later.find(([x, y]) => y - x + 1 >= 0.8 * longest)!;
      return [middle(a, b), b - a + 1 >= good ? "pause" : "breath"];
    }
  }
  const power = Array.from(levels.subarray(i0, i1 + 1), (level) => 10 ** (level / 10));
  const smoothed = power.map((_, i) => [i - 2, i - 1, i, i + 1].reduce((sum, k) => sum + (power[k] ?? 0), 0) / 4);
  const j = i0 + smoothed.indexOf(Math.min(...smoothed));
  return [round3((j + 0.5) * LEVEL_FRAME_S), "quietest"];
}

// Parts covering the whole video. A last piece shorter than a quarter part
// (and 20s) joins the part before it.
export function planSplitterParts(durationS: number, partS: number, { smart = true, maxExtraS = 20, levels = null as Float32Array | null } = {}): SplitterPart[] {
  const part = Math.max(5, partS);
  const speechDb = levels ? speechLevel(levels) : 0;
  const parts: SplitterPart[] = [];
  let start = 0;
  while (start + part < durationS - 0.05) {
    const target = start + part;
    const [cut, how] = smart && levels ? quietPoint(levels, target, Math.min(target + Math.max(0, maxExtraS), durationS), speechDb) : [target, "exact" as const];
    if (durationS - cut < Math.min(MIN_TAIL_S, part / 4)) break;
    parts.push({ n: parts.length + 1, start: Math.round(start * 1000) / 1000, end: Math.round(cut * 1000) / 1000, cut: how });
    start = cut;
  }
  parts.push({ n: parts.length + 1, start: Math.round(start * 1000) / 1000, end: Math.round(durationS * 1000) / 1000, cut: "end" });
  return parts;
}
