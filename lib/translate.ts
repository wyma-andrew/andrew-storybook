export type TranslateRect = { x: number; y: number; width: number; height: number };
export type TranslateCue = { start: number; end: number; text: string };

export type TranslateVideoReplacement = {
  objectKey: string;
  uploadId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number;
  lastModified: number;
  width: number;
  height: number;
};

export type TranslateProject = {
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
  sourceReplacement: Pick<TranslateVideoReplacement, "fileName" | "sizeBytes" | "lastModified"> | null;
  srtFileName: string | null;
  srtText: string | null;
  subtitleCues: TranslateCue[] | null;
  translatedSrtFileName: string | null;
  translatedSrtText: string | null;
  subtitleTimingMode: "original" | "aligned" | "translated";
  blurRegions: TranslateRect[];
  subtitleY: number;
  subtitleSize: number;
  renderStatus: "idle" | "running" | "done" | "failed";
  renderError: string | null;
  renderOutputUrl: string | null;
  renderProgress: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TranslateProjectPatch = Partial<Pick<TranslateProject,
  "name" | "srtFileName" | "srtText" | "subtitleCues" | "translatedSrtFileName" | "translatedSrtText" | "subtitleTimingMode" | "blurRegions" | "subtitleY" | "subtitleSize"
>>;

export type TranslateProjectListItem = Pick<TranslateProject,
  "id" | "name" | "sourceFileName" | "sourceSizeBytes" | "sourceDurationSeconds" |
  "sourceUploadStatus" | "srtFileName" | "renderStatus" | "updatedAt"
>;

export function mapTranslateProjectListItem(row: Record<string, unknown>): TranslateProjectListItem {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceUploadStatus: row.source_upload_status as TranslateProject["sourceUploadStatus"],
    srtFileName: (row.srt_file_name as string) ?? null,
    renderStatus: row.render_status as TranslateProject["renderStatus"],
    updatedAt: row.updated_at as string,
  };
}

export function mapTranslateProject(row: Record<string, unknown>): TranslateProject {
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
    sourceUploadStatus: row.source_upload_status as TranslateProject["sourceUploadStatus"],
    sourceReplacement: row.source_replacement ? {
      fileName: (row.source_replacement as TranslateVideoReplacement).fileName,
      sizeBytes: (row.source_replacement as TranslateVideoReplacement).sizeBytes,
      lastModified: (row.source_replacement as TranslateVideoReplacement).lastModified,
    } : null,
    srtFileName: (row.srt_file_name as string) ?? null,
    srtText: (row.srt_text as string) ?? null,
    subtitleCues: (row.subtitle_cues as TranslateCue[]) ?? null,
    translatedSrtFileName: (row.translated_srt_file_name as string) ?? null,
    translatedSrtText: (row.translated_srt_text as string) ?? null,
    subtitleTimingMode: row.subtitle_timing_mode as TranslateProject["subtitleTimingMode"],
    blurRegions: (row.blur_regions as TranslateRect[]) ?? [],
    subtitleY: Number(row.subtitle_y),
    subtitleSize: Number(row.subtitle_size),
    renderStatus: row.render_status as TranslateProject["renderStatus"],
    renderError: (row.render_error as string) ?? null,
    renderOutputUrl: (row.render_output_url as string) ?? null,
    renderProgress: row.render_progress == null ? null : Number(row.render_progress),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export type SrtBlock = TranslateCue & { number: number; numbered: boolean };

const SRT_NUMBER_LINE = /^[*_`\s]*(\d+)[*_`\s]*$/;

function srtSeconds(value: string | undefined) {
  const match = value?.match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, "0")) / 1000 : NaN;
}

// Line-based rather than blank-line-based: SRT pasted from a chat reply often loses
// the blank lines between blocks or arrives inside a ``` fence.
export function parseSrtBlocks(source: string): SrtBlock[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").filter((line) => !/^\s*```/.test(line));
  const isTiming = (line: string | undefined) => !!line && line.includes("-->");
  const startsBlock = (index: number) => SRT_NUMBER_LINE.test(lines[index] ?? "") && isTiming(lines[index + 1]);
  const blocks: SrtBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!isTiming(lines[index])) continue;
    const [startText, endText] = lines[index].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const label = lines[index - 1]?.match(SRT_NUMBER_LINE);
    const textLines: string[] = [];
    let next = index + 1;
    while (next < lines.length && lines[next].trim() && !isTiming(lines[next]) && !startsBlock(next)) textLines.push(lines[next++]);
    const start = srtSeconds(startText);
    const end = srtSeconds(endText);
    const text = textLines.join("\n").replace(/<[^>]*>/g, "").trim();
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      blocks.push({ number: label ? Number(label[1]) : blocks.length + 1, numbered: !!label, start, end, text });
    }
    index = next - 1;
  }
  return blocks;
}

export function parseSrt(source: string): TranslateCue[] {
  return parseSrtBlocks(source).map(({ start, end, text }) => ({ start, end, text })).sort((a, b) => a.start - b.start);
}

export function srtBlocksToText(blocks: SrtBlock[]) {
  return [...blocks].sort((a, b) => a.number - b.number)
    .map((block) => `${block.number}\n${formatSrtTime(block.start)} --> ${formatSrtTime(block.end)}\n${block.text}\n`).join("\n");
}

// A pasted block takes the number of the synced cue with its exact timing when there
// is one: chat translations keep the timestamps but sometimes repeat or skip a number.
// Otherwise its own SRT number is used; blocks with neither are skipped.
export function mergeSrtBlocks(existing: string | null, pasted: string, reference: TranslateCue[] = []) {
  const merged = new Map(parseSrtBlocks(existing ?? "").map((block) => [block.number, block]));
  const byTiming = new Map(reference.map((cue, index) => [`${Math.round(cue.start * 1000)}-${Math.round(cue.end * 1000)}`, index + 1]));
  const seen = new Set<number>();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let renumbered = 0;
  let duplicates = 0;
  for (const block of parseSrtBlocks(pasted)) {
    const matched = byTiming.get(`${Math.round(block.start * 1000)}-${Math.round(block.end * 1000)}`);
    const number = matched ?? (block.numbered ? block.number : null);
    if (number === null) { skipped++; continue; }
    if (seen.has(number)) { duplicates++; continue; }
    seen.add(number);
    if (block.numbered && number !== block.number) renumbered++;
    if (merged.has(number)) updated++;
    else added++;
    merged.set(number, { ...block, number });
  }
  return { text: srtBlocksToText([...merged.values()]), added, updated, skipped, renumbered, duplicates };
}

export function translateCues(project: Pick<TranslateProject, "srtText" | "subtitleCues" | "translatedSrtText" | "subtitleTimingMode">): TranslateCue[] {
  if (project.subtitleTimingMode === "translated" && project.translatedSrtText) return parseSrt(project.translatedSrtText);
  return project.subtitleTimingMode === "aligned" && project.subtitleCues
    ? project.subtitleCues : parseSrt(project.srtText ?? "");
}

export function translateCuesKeepAllText(cues: TranslateCue[], srtText: string): boolean {
  const compact = (text: string) => text.replace(/\s+/gu, "");
  return compact(cues.map((cue) => cue.text).join("")) === compact(parseSrt(srtText).map((cue) => cue.text).join(""));
}

export function validTranslateCues(value: unknown, duration: number): value is TranslateCue[] {
  if (!Array.isArray(value) || value.length > 4000 || JSON.stringify(value).length > 2_000_000) return false;
  let previousStart = 0;
  for (const cue of value) {
    if (!cue || typeof cue !== "object" || typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 2000
      || typeof cue.start !== "number" || typeof cue.end !== "number"
      || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < previousStart - 0.02 || cue.end <= cue.start || cue.end > duration + 0.1) return false;
    previousStart = cue.start;
  }
  return true;
}

export function isTranslateRect(value: unknown): value is TranslateRect {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const numbers = [r.x, r.y, r.width, r.height];
  return numbers.every((n) => typeof n === "number" && Number.isFinite(n))
    && (r.x as number) >= 0 && (r.y as number) >= 0
    && (r.width as number) >= 5 && (r.height as number) >= 5
    && (r.x as number) + (r.width as number) <= 100
    && (r.y as number) + (r.height as number) <= 100;
}

export function clampTranslateRect(rect: TranslateRect): TranslateRect {
  const width = Math.min(100, Math.max(5, rect.width));
  const height = Math.min(100, Math.max(5, rect.height));
  return { width, height, x: Math.min(100 - width, Math.max(0, rect.x)), y: Math.min(100 - height, Math.max(0, rect.y)) };
}

export function translateBlurRadius(rect: TranslateRect, width: number, height: number) {
  const regionWidth = Math.max(2, Math.round(width * rect.width / 100));
  const regionHeight = Math.max(2, Math.round(height * rect.height / 100));
  return Math.max(2, Math.min(24, Math.floor(Math.min(regionWidth, regionHeight) / 8)));
}

export function translateBlurCssPx(rect: TranslateRect, sourceWidth: number, sourceHeight: number, previewWidth: number) {
  const radius = translateBlurRadius(rect, sourceWidth, sourceHeight);
  const sigma = Math.sqrt(2 * ((2 * radius + 1) ** 2 - 1) / 12);
  return sigma * previewWidth / sourceWidth;
}

export function formatSrtTime(seconds: number) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function translateCuesToSrt(cues: TranslateCue[], firstNumber = 1) {
  return cues.map((cue, index) => `${index + firstNumber}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`).join("\n");
}

export const TRANSLATE_PROMPT_BATCH_SIZE = 200;

export function buildTranslateSrtPrompt(srt: string, firstBlock: number, lastBlock: number) {
  return `Act as a professional film subtitle translator. Your goal is to help Myanmar viewers fully understand the movie, not to translate word by word.

Translate the SRT below into natural, conversational Myanmar (Burmese).

Rules:
1. Exact formatting: Keep every subtitle number and timestamp (including milliseconds) exactly as they are. Do not merge, split, add, or remove any subtitle blocks.
2. Translation style: Translate only the subtitle text, using spoken Burmese that sounds like real dialogue. Read surrounding lines for context. Match each character's tone (polite, casual, rude, elderly), keep names consistent, and adapt idioms and jokes naturally. Keep lines short enough to read at a glance.
3. Completeness: The input has ${lastBlock - firstBlock + 1} blocks, from block ${firstBlock} to block ${lastBlock}. Translate every one of them. Before answering, check that your output also runs from block ${firstBlock} to block ${lastBlock}. Do not stop early or drop the final blocks.
4. Clean output: Output only the translated SRT, with no introduction, explanations, or notes.

SRT:
${srt}

Please ensure you translate all blocks completely, ending precisely at block ${lastBlock}.`;
}


export function formatCueTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const secs = `${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

// Accepts h:mm:ss.cc, m:ss.cc, or plain seconds; returns NaN for anything else.
export function parseCueTime(value: string) {
  const parts = value.trim().replace(",", ".").split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return NaN;
  if (parts.slice(0, -1).some((part) => part.includes("."))) return NaN;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

const MIN_NEIGHBOUR_S = 0.3;

// Neighbours are trimmed rather than removed or merged, so an edit never drops text.
export function applyCueEdit<T extends TranslateCue>(cues: T[], index: number, edit: TranslateCue) {
  const previous = cues[index - 1];
  const next = cues[index + 1];
  const previousEnd = previous && edit.start < previous.end ? edit.start : null;
  const nextStart = next && edit.end > next.start ? edit.end : null;
  let error: string | null = null;
  if (previousEnd !== null && previousEnd - previous.start < MIN_NEIGHBOUR_S) {
    error = `Start must be at least ${formatCueTime(previous.start + MIN_NEIGHBOUR_S)} to keep the previous subtitle.`;
  } else if (nextStart !== null && next.end - nextStart < MIN_NEIGHBOUR_S) {
    error = `End must be at most ${formatCueTime(next.end - MIN_NEIGHBOUR_S)} to keep the next subtitle.`;
  }
  const result = cues.map((cue, i) => i === index ? { ...cue, ...edit }
    : i === index - 1 && previousEnd !== null ? { ...cue, end: previousEnd }
    : i === index + 1 && nextStart !== null ? { ...cue, start: nextStart } : cue);
  return { cues: result, previousEnd, nextStart, error };
}
