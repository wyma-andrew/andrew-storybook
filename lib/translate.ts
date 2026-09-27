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

export type SrtBlock = TranslateCue & { number: number };

export function parseSrtBlocks(source: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  for (const block of source.replace(/^\uFEFF/, "").replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [startText, endText] = lines[timingIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const toSeconds = (value: string) => {
      const match = value?.match(/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/);
      return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000 : NaN;
    };
    const start = toSeconds(startText);
    const end = toSeconds(endText);
    const text = lines.slice(timingIndex + 1).join("\n").replace(/<[^>]*>/g, "").trim();
    const label = lines[timingIndex - 1]?.trim() ?? "";
    const number = /^\d+$/.test(label) ? Number(label) : blocks.length + 1;
    if (text && Number.isFinite(start) && Number.isFinite(end) && end > start) blocks.push({ number, start, end, text });
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

// Blocks are matched by their SRT number, so translated batches keep the numbers
// the Copy Prompt batches were given.
export function mergeSrtBlocks(existing: string | null, pasted: string) {
  const merged = new Map(parseSrtBlocks(existing ?? "").map((block) => [block.number, block]));
  let added = 0;
  let updated = 0;
  for (const block of parseSrtBlocks(pasted)) {
    if (merged.has(block.number)) updated++;
    else added++;
    merged.set(block.number, block);
  }
  return { text: srtBlocksToText([...merged.values()]), added, updated };
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

