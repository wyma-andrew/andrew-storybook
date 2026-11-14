import type { TranslateRect } from "@/lib/translate";
import { outputFrameSize, type FrameFill, type FrameQuality, type FrameRatio } from "./video-framing";

export type RecapV2AspectRatio = FrameRatio;
export type RecapV2FitMode = FrameFill;
export type RecapV2Quality = FrameQuality;
export type RecapV2JobKind = "transcribe" | "translate" | "render";

// recap-en-to-mm's SOURCE_LANGUAGES. Chinese is heard by FunASR, every other
// language by whisper-mm; "auto" lets Whisper detect it first.
export const RECAP_V2_SOURCE_LANGUAGES = {
  auto: "Auto-detect", en: "English", zh: "Chinese", hi: "Hindi", ko: "Korean", ja: "Japanese", th: "Thai",
  vi: "Vietnamese", id: "Indonesian", ms: "Malay", tl: "Filipino (Tagalog)", es: "Spanish",
  pt: "Portuguese", fr: "French", de: "German", it: "Italian", ru: "Russian", tr: "Turkish",
  ar: "Arabic", bn: "Bengali", ta: "Tamil", te: "Telugu", ur: "Urdu",
} as const;
export type RecapV2SourceLanguage = keyof typeof RECAP_V2_SOURCE_LANGUAGES;

export function recapV2LanguageName(code: string | null | undefined) {
  return RECAP_V2_SOURCE_LANGUAGES[(code ?? "") as RecapV2SourceLanguage] ?? code ?? "the source language";
}

// One Smart Sync unit: one source sentence, its translation, and the window of
// picture it owns. Video windows tile the whole source.
export type RecapV2Unit = {
  id: number;
  speechStart: number;
  speechEnd: number;
  videoStart: number;
  videoEnd: number;
  source: string;
  text: string;
  // A muted line keeps its picture at 1.0x with no narration or caption, so
  // cuts and every other line's sync are untouched. See history/recap-v2.md.
  muted?: boolean;
};

export type RecapV2Project = {
  id: string;
  name: string;
  sourceFileName: string;
  sourceUrl: string | null;
  coverUrl: string | null;
  sourceObjectKey: string;
  sourceContentType: string;
  sourceSizeBytes: number;
  sourceDurationSeconds: number;
  sourceLastModified: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceUploadStatus: "pending" | "uploading" | "ready" | "failed";
  sourceLanguage: RecapV2SourceLanguage;
  detectedLanguage: string | null;
  units: RecapV2Unit[];
  voiceId: string;
  voiceVolume: number;
  aspectRatio: RecapV2AspectRatio;
  fitMode: RecapV2FitMode;
  quality: RecapV2Quality;
  zoom: number;
  mirror: boolean;
  subtitlesEnabled: boolean;
  shortPauses: boolean;
  subtitleY: number;
  subtitleSize: number;
  blurRegions: TranslateRect[];
  titleText: string;
  titleSize: number;
  titleX: number;
  titleY: number;
  extraText: string;
  extraSize: number;
  extraX: number;
  extraY: number;
  logoUrl: string | null;
  logoObjectKey: string | null;
  logoSize: number;
  logoOpacity: number;
  logoX: number;
  logoY: number;
  jobKind: RecapV2JobKind | null;
  jobStatus: "idle" | "running" | "done" | "failed";
  jobStage: string | null;
  jobProgress: number | null;
  jobError: string | null;
  renderOutputUrl: string | null;
  hasSrt: boolean;
  createdAt: string;
  updatedAt: string;
};

export const RECAP_V2_SETTING_KEYS = [
  "sourceLanguage", "voiceId", "voiceVolume", "aspectRatio", "fitMode", "quality", "zoom", "mirror", "subtitlesEnabled",
  "shortPauses", "subtitleY", "subtitleSize", "blurRegions", "titleText", "titleSize", "titleX", "titleY",
  "extraText", "extraSize", "extraX", "extraY", "logoSize", "logoOpacity", "logoX", "logoY",
] as const;

export type RecapV2ProjectPatch = Partial<Pick<RecapV2Project, "name" | (typeof RECAP_V2_SETTING_KEYS)[number]>>
  & { unitTexts?: { id: number; text: string }[]; unitMutes?: { id: number; muted: boolean }[]; logo?: { objectKey: string } | null };

export type RecapV2ProjectListItem = Pick<RecapV2Project,
  "id" | "name" | "sourceFileName" | "sourceSizeBytes" | "sourceDurationSeconds" | "sourceUploadStatus" | "coverUrl" | "updatedAt"
> & { unitCount: number; translated: boolean; rendered: boolean };

export const RECAP_V2_LIST_COLUMNS = "id,name,source_file_name,source_size_bytes,source_duration_seconds,source_upload_status,cover_url,updated_at,units,render_output_url";

export type RecapV2Progress = Pick<RecapV2Project, "jobKind" | "jobStatus" | "jobStage" | "jobProgress" | "updatedAt">;

export const RECAP_V2_PROGRESS_COLUMNS = "job_kind,job_status,job_stage,job_progress,updated_at";

export function mapRecapV2Progress(row: Record<string, unknown>): RecapV2Progress {
  return {
    jobKind: (row.job_kind as RecapV2JobKind) ?? null,
    jobStatus: row.job_status as RecapV2Project["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    jobProgress: row.job_progress == null ? null : Number(row.job_progress),
    updatedAt: row.updated_at as string,
  };
}

// A job row older than this is treated as orphaned by a restart and may be reclaimed.
export const RECAP_V2_STALE_JOB_MS = 2 * 60 * 60 * 1000;

export function recapV2JobRunning(row: { job_status: unknown; updated_at: unknown }) {
  return row.job_status === "running" && Date.now() - Date.parse(String(row.updated_at)) < RECAP_V2_STALE_JOB_MS;
}

export function mapRecapV2ProjectListItem(row: Record<string, unknown>): RecapV2ProjectListItem {
  const units = (row.units as RecapV2Unit[]) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceUploadStatus: row.source_upload_status as RecapV2Project["sourceUploadStatus"],
    coverUrl: (row.cover_url as string) ?? null,
    updatedAt: row.updated_at as string,
    unitCount: units.length,
    translated: units.length > 0 && units.every((unit) => unit.muted || unit.text.trim()),
    rendered: Boolean(row.render_output_url),
  };
}

export function mapRecapV2Project(row: Record<string, unknown>): RecapV2Project {
  return {
    id: row.id as string,
    name: row.name as string,
    sourceFileName: row.source_file_name as string,
    sourceUrl: (row.source_url as string) ?? null,
    coverUrl: (row.cover_url as string) ?? null,
    sourceObjectKey: row.source_object_key as string,
    sourceContentType: row.source_content_type as string,
    sourceSizeBytes: Number(row.source_size_bytes),
    sourceDurationSeconds: Number(row.source_duration_seconds),
    sourceLastModified: Number(row.source_last_modified),
    sourceWidth: Number(row.source_width),
    sourceHeight: Number(row.source_height),
    sourceUploadStatus: row.source_upload_status as RecapV2Project["sourceUploadStatus"],
    sourceLanguage: (row.source_language as RecapV2SourceLanguage) ?? "auto",
    detectedLanguage: (row.detected_language as string) ?? null,
    units: (row.units as RecapV2Unit[]) ?? [],
    voiceId: row.voice_id as string,
    voiceVolume: Number(row.voice_volume ?? 100),
    aspectRatio: row.aspect_ratio as RecapV2AspectRatio,
    fitMode: row.fit_mode as RecapV2FitMode,
    quality: (row.quality as RecapV2Quality) ?? "1080",
    zoom: Number(row.zoom),
    mirror: Boolean(row.mirror),
    subtitlesEnabled: Boolean(row.subtitles_enabled),
    shortPauses: row.short_pauses !== false,
    subtitleY: Number(row.subtitle_y),
    subtitleSize: Number(row.subtitle_size),
    blurRegions: (row.blur_regions as TranslateRect[]) ?? [],
    titleText: (row.title_text as string) ?? "",
    titleSize: Number(row.title_size),
    titleX: Number(row.title_x),
    titleY: Number(row.title_y),
    extraText: (row.extra_text as string) ?? "",
    extraSize: Number(row.extra_size),
    extraX: Number(row.extra_x),
    extraY: Number(row.extra_y),
    logoUrl: (row.logo_url as string) ?? null,
    logoObjectKey: (row.logo_object_key as string) ?? null,
    logoSize: Number(row.logo_size),
    logoOpacity: Number(row.logo_opacity),
    logoX: Number(row.logo_x),
    logoY: Number(row.logo_y),
    jobKind: (row.job_kind as RecapV2JobKind) ?? null,
    jobStatus: row.job_status as RecapV2Project["jobStatus"],
    jobStage: (row.job_stage as string) ?? null,
    jobProgress: row.job_progress == null ? null : Number(row.job_progress),
    jobError: (row.job_error as string) ?? null,
    renderOutputUrl: (row.render_output_url as string) ?? null,
    hasSrt: Boolean(row.render_srt_key),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function recapV2OutputSize(project: Pick<RecapV2Project, "aspectRatio" | "quality" | "sourceWidth" | "sourceHeight">) {
  return outputFrameSize({ ratio: project.aspectRatio, quality: project.quality, sourceWidth: project.sourceWidth, sourceHeight: project.sourceHeight });
}

// Line rules are recap-en-to-mm's sentence-locked `atomicize_timestamp_segments`
// (profile v33, 2026-10-12): a line is one whole source sentence, so a sentence
// is never cut in two and told twice. Do not "improve" them here — see
// history/recap-v2.md.
const SENTENCE_UNIT_TARGET_S = 6.5;
const SENTENCE_UNIT_BREATH_S = 10;
const SENTENCE_UNIT_HARD_S = 24;
const SENTENCE_UNIT_GAP_S = 1.5;

const SENTENCE_END = /[.!?…။।॥。！？۔؟]["'’”)]?$/;
const SOFT_CLAUSE_END = /[;,:၊；，、،]["'’”)]?$/;
const ABBREVIATIONS = new Set(["mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "etc.", "e.g.", "i.e."]);
const TRAILING_PUNCTUATION = /[\p{P}\s]+$/u;
const TOKEN = /[A-Za-z0-9']+[^\sA-Za-z0-9'\p{Script=Han}]*|\p{Script=Han}[^\sA-Za-z0-9'\p{Script=Han}]*|[^\s]/gu;
const LATIN = /^[A-Za-z0-9']/;

// `spaced` is Whisper's own word spacing; FunASR's characters carry none.
type Token = { text: string; start: number; end: number; segment: number; spaced?: boolean };
type Group = { tokens: Token[] };

function joinTokens(tokens: Token[]) {
  return tokens.reduce((text, token) => {
    const space = token.spaced ?? (LATIN.test(token.text) && /[A-Za-z0-9'.,!?]$/.test(text));
    return text && space ? `${text} ${token.text}` : text + token.text;
  }, "");
}

function endsSentence(text: string) {
  const cleaned = text.trim().toLowerCase();
  if (ABBREVIATIONS.has(cleaned)) return false;
  // "N." + "Ben": a lone Latin initial belongs to the name after it.
  if (/^[a-z]\.['’"”)]?$/.test(cleaned)) return false;
  return SENTENCE_END.test(cleaned);
}

// FunASR stamps characters without their punctuation, so every mark in the
// segment's text — inside it too: one segment often carries several "，" — is
// put back on the stamped character before it. Those marks are what the
// sentence/clause rules read.
function withPunctuation(text: string, measured: Token[]): Token[] {
  const out: Token[] = [];
  let position = 0;
  for (const token of measured) {
    const at = text.indexOf(token.text, position);
    // Stamps that do not line up with the text (the worker logs such mismatches)
    // fall back to the segment's closing mark only.
    if (at < 0 || /[\p{L}\p{N}]/u.test(text.slice(position, at))) {
      const mark = text.match(TRAILING_PUNCTUATION)?.[0].trim() ?? "";
      return measured.map((item, index) => index === measured.length - 1 ? { ...item, text: item.text + mark } : item);
    }
    position = at + token.text.length;
    const marks = text.slice(position).match(/^[\p{P}\s]+/u)?.[0] ?? "";
    out.push({ ...token, text: token.text + marks.replace(/\s+/g, "") });
    position += marks.length;
  }
  return out;
}

// A segment with no stamps is spread evenly, like the tool's `_fallback_word_tokens`.
function segmentTokens(segments: { start: number; end: number; text: string }[], words: { word: string; start: number; end: number }[]) {
  const tokens: Token[] = [];
  const sortedWords = [...words].filter((word) => word.end > word.start).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const [segmentIndex, segment] of segments.entries()) {
    const text = segment.text.trim();
    if (!text || segment.end <= segment.start) continue;
    while (cursor < sortedWords.length && sortedWords[cursor].end <= segment.start - 0.05) cursor++;
    const measured: Token[] = [];
    while (cursor < sortedWords.length && sortedWords[cursor].start < segment.end + 0.05) {
      const word = sortedWords[cursor++];
      const spaced = /^\s/.test(word.word);
      const text = word.word.trim();
      if (text) measured.push({ text, start: word.start, end: word.end, segment: segmentIndex, ...(spaced ? { spaced } : {}) });
    }
    if (measured.length) {
      tokens.push(...withPunctuation(text, measured));
      continue;
    }
    const pieces = text.match(TOKEN) ?? [text];
    const step = (segment.end - segment.start) / pieces.length;
    pieces.forEach((piece, index) => tokens.push({ text: piece, start: segment.start + index * step, end: segment.start + (index + 1) * step, segment: segmentIndex }));
  }
  return tokens.sort((a, b) => a.start - b.start || a.end - b.end);
}

const SPEAKABLE = /[\p{L}\p{N}]/u;

function alnumChars(text: string) {
  return Array.from(text.toLowerCase()).filter((ch) => /[\p{L}\p{N}]/u.test(ch));
}

// The tool's `_filter_local_whisper_artifact_units`: a long ASR segment that is
// almost all one character ("我我我…", "冲冲冲…") is a hallucination, and a unit
// made only of such segments with near-no information is dropped. The tool ran
// it for Whisper only; FunASR produces the same loops (by the user, 2026-10-09).
// Thresholds are the tool's.
function pathologicalSegments(segments: { start: number; end: number; text: string }[]) {
  const bad = new Set<number>();
  segments.forEach((segment, index) => {
    if (segment.end - segment.start < 4) return;
    const chars = alnumChars(segment.text);
    if (chars.length < 24) return;
    const counts = new Map<string, number>();
    for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    if (Math.max(...counts.values()) / chars.length >= 0.72 && counts.size / chars.length <= 0.18) bad.add(index);
  });
  return bad;
}

function lowInformationRepetition(text: string) {
  const chars = alnumChars(text);
  if (!chars.length || new Set(chars).size <= 1) return true;
  const tokens = text.split(/\s+/).map((token) => alnumChars(token).join("")).filter(Boolean);
  if (tokens.length < 4) return false;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return Math.max(...counts.values()) / tokens.length >= 0.75 && counts.size / tokens.length <= 0.25;
}

// `segmentBreaks`: the source is not English, so where Whisper or FunASR ends
// one of its own segments (a pause) a long line may end even without a mark.
export function buildRecapV2Units(
  segments: { start: number; end: number; text: string }[],
  words: { word: string; start: number; end: number }[],
  durationS: number,
  { segmentBreaks = true }: { segmentBreaks?: boolean } = {}
): RecapV2Unit[] {
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
  const tokens = segmentTokens(sortedSegments, words);
  const segmentEnds = new Set(tokens.flatMap((token, index) => index + 1 === tokens.length || tokens[index + 1].segment !== token.segment ? [index] : []));
  const spoken = tokens.length ? tokens.at(-1)!.end - tokens[0].start : 0;
  // 2026-10-17 in the tool: a Hindi video heard as Urdu had no sentence marks
  // and every line ran to 24s. With few marks, a segment end is a sentence end.
  const fewMarks = tokens.filter((token) => endsSentence(token.text)).length < spoken / 20;
  const groups: Group[] = [];
  let current: Token[] = [];
  const close = () => { if (current.length) groups.push({ tokens: current }); current = []; };
  tokens.forEach((token, index) => {
    current.push(token);
    const duration = token.end - current[0].start;
    const nextGap = index + 1 < tokens.length ? Math.max(0, tokens[index + 1].start - token.end) : 0;
    const text = token.text.trim();
    if (nextGap >= SENTENCE_UNIT_GAP_S) close();
    else if (endsSentence(text) || (fewMarks && segmentEnds.has(index) && duration >= 2)) close();
    else if (duration >= SENTENCE_UNIT_TARGET_S && SOFT_CLAUSE_END.test(text)) close();
    else if (segmentBreaks && segmentEnds.has(index) && duration >= SENTENCE_UNIT_BREATH_S) close();
    else if (duration >= SENTENCE_UNIT_BREATH_S && nextGap >= 0.35) close();
    else if (duration >= SENTENCE_UNIT_HARD_S) close();
  });
  close();

  // A one- or two-token flash (a repeated name, a stray syllable) is folded
  // into the unit after it rather than becoming its own translation ID.
  const merged: Group[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const next = groups[i + 1];
    const duration = group.tokens.at(-1)!.end - group.tokens[0].start;
    if (next && duration <= 0.5 && group.tokens.length <= 2 && next.tokens[0].start - group.tokens.at(-1)!.end <= 0.6) {
      const left = joinTokens(group.tokens).replace(/[.!?…。！？]+$/u, "").toLowerCase();
      const repeated = left && left === next.tokens[0].text.replace(TRAILING_PUNCTUATION, "").toLowerCase();
      groups[i + 1] = { tokens: repeated ? [{ ...next.tokens[0], start: group.tokens[0].start }, ...next.tokens.slice(1)] : [...group.tokens, ...next.tokens] };
      continue;
    }
    merged.push(group);
  }

  const pathological = pathologicalSegments(sortedSegments);
  const kept = merged.filter((group) => {
    const source = joinTokens(group.tokens);
    if (!SPEAKABLE.test(source)) return false;
    const fromJunk = group.tokens.every((token) => pathological.has(token.segment));
    return !(fromJunk && lowInformationRepetition(source));
  });

  const units = kept.map((group, index) => ({
    id: index + 1,
    speechStart: round3(group.tokens[0].start),
    speechEnd: round3(group.tokens.at(-1)!.end),
    videoStart: 0,
    videoEnd: 0,
    source: joinTokens(group.tokens),
    text: "",
  }));
  return assignFullCoverage(units, durationS);
}

// The silence between two units is split at its middle, so the first unit
// starts at 0, the last ends at the source's end, and no picture is dropped.
export function assignFullCoverage(units: RecapV2Unit[], durationS: number): RecapV2Unit[] {
  if (!units.length) return [];
  const out = units.map((unit) => ({ ...unit }));
  out[0].videoStart = 0;
  for (let i = 0; i < out.length - 1; i++) {
    const left = out[i].speechEnd;
    const right = out[i + 1].speechStart;
    const boundary = round3(Math.max(0, Math.min(durationS, right >= left ? (left + right) / 2 : left)));
    out[i].videoEnd = boundary;
    out[i + 1].videoStart = boundary;
  }
  out[out.length - 1].videoEnd = round3(durationS);
  return out;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function formatUnitTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

// A line can carry several sentences; on screen it is shown a sentence (or
// clause) at a time, each for its share of the line's audio by length.
const CAPTION_MAX_CHARS = 40;

export function recapV2CaptionChunks(text: string) {
  const pieces = text.replace(/\s*\n\s*/g, " ").split(/(?<=။)\s*/).map((piece) => piece.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const piece of pieces) {
    if (piece.length <= CAPTION_MAX_CHARS) { chunks.push(piece); continue; }
    let current = "";
    for (const part of piece.split(/(?<=၊)\s*|\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${part}` : part;
      if (current && candidate.length > CAPTION_MAX_CHARS) { chunks.push(current); current = part; }
      else current = candidate;
    }
    if (current) chunks.push(current);
  }
  return chunks.length ? chunks : [text.trim()];
}
