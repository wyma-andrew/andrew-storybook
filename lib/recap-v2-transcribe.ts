import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ASR_NOT_CONFIGURED, asrWorkerConfigured, transcribeWithAsrWorker } from "./asr-worker";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { dropUnreliableSegments } from "./movie-recap-source-transcript";
import { downloadObjectToFile, getObjectText, putObject, recapV2AsrKey } from "./r2";
import { buildRecapV2Units, recapV2LanguageName, type RecapV2Project } from "./recap-v2";
import type { RecapV2JobProgress } from "./recap-v2-job";
import { transcribeWithWhisperWords, WHISPER_MM_NOT_CONFIGURED, whisperWorkerConfigured } from "./transcript-worker";

type Segment = { start: number; end: number; text: string };
type Word = { word: string; start: number; end: number };

type RecapV2AsrTranscript = {
  sourceObjectKey: string;
  language: string;
  segments: Segment[];
  words: Word[];
};

// recap-en-to-mm's `_check_heard_speech`: when a quarter of the lines say the
// same as one of the five before them, the ASR listened for the wrong language.
// It stops here, before any translation is paid for.
const REPEAT_STOP_SHARE = 0.25;
const REPEAT_MIN_LINES = 10;

export function repeatedLineShare(segments: Segment[]) {
  const lines = segments
    .map((segment) => segment.text.toLowerCase().replace(/[\p{P}\p{S}_]+/gu, " ").replace(/\s+/g, " ").trim())
    .filter((text) => text.split(" ").length >= 3 || text.replace(/ /g, "").length >= 6);
  const repeated = lines.filter((text, index) => lines.slice(Math.max(0, index - 5), index).includes(text)).length;
  const counts = new Map<string, number>();
  for (const text of lines) counts.set(text, (counts.get(text) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, count]) => count > 1);
  return { share: lines.length ? repeated / lines.length : 0, count: lines.length, top };
}

function checkHeardSpeech(segments: Segment[], language: string) {
  const { share, count, top } = repeatedLineShare(segments);
  if (count < REPEAT_MIN_LINES || share < REPEAT_STOP_SHARE) return;
  const name = recapV2LanguageName(language);
  const examples = top.map(([text, n]) => `"${text}" ×${n}`).join(", ");
  throw new Error(`The speech worker heard little real ${name} speech: ${Math.round(share * 100)}% of its lines repeat (${examples}). If the video is in another language, choose it in Source language (or Auto-detect) and transcribe again.`);
}

function unitsFrom(project: RecapV2Project, raw: RecapV2AsrTranscript) {
  const units = buildRecapV2Units(raw.segments, raw.words, project.sourceDurationSeconds, { segmentBreaks: raw.language !== "en" });
  if (!units.length) throw new Error("No speech was found in this video.");
  return units;
}

export async function resplitRecapV2(project: RecapV2Project) {
  const text = await getObjectText(recapV2AsrKey(project.id));
  const raw = text ? JSON.parse(text) as RecapV2AsrTranscript : null;
  if (!raw || raw.sourceObjectKey !== project.sourceObjectKey) {
    throw new Error("This project has no saved speech transcript yet. Transcribe it once; after that, lines can be re-split for free.");
  }
  return unitsFrom(project, { ...raw, language: raw.language ?? "zh" });
}

async function listenFunAsr(audioPath: string, signal?: AbortSignal) {
  if (!asrWorkerConfigured()) throw new Error(ASR_NOT_CONFIGURED);
  const { segments, words } = await transcribeWithAsrWorker(audioPath, { signal, words: true });
  return { language: "zh", segments, words };
}

// Whisper's low-confidence and loop segments are dropped with their words.
async function listenWhisper(audioPath: string, language: string, signal?: AbortSignal) {
  if (!whisperWorkerConfigured()) throw new Error(WHISPER_MM_NOT_CONFIGURED);
  const heard = await transcribeWithWhisperWords(audioPath, { language, signal });
  const segments = dropUnreliableSegments(heard.segments);
  const words = heard.words.filter((word) => segments.some((segment) => word.start >= segment.start - 0.05 && word.end <= segment.end + 0.05));
  return { language: heard.language, segments, words };
}

export async function transcribeRecapV2(project: RecapV2Project, onProgress: RecapV2JobProgress, signal?: AbortSignal) {
  const workDir = await mkdtemp(path.join(tmpdir(), "recap-v2-asr-"));
  try {
    onProgress("Downloading source", 0);
    const sourcePath = path.join(workDir, "source");
    await downloadObjectToFile(project.sourceObjectKey, sourcePath, {
      signal,
      onProgress: (done, total) => onProgress("Downloading source", total ? 0.25 * done / total : null),
    });
    onProgress("Extracting audio", null);
    const audioPath = path.join(workDir, "audio.ogg");
    await run(FFMPEG, ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "16k", audioPath], signal);

    let heard;
    if (project.sourceLanguage === "zh") {
      onProgress("Listening to the speech (FunASR)", null);
      heard = await listenFunAsr(audioPath, signal);
    } else {
      onProgress(project.sourceLanguage === "auto" ? "Listening to the speech (Whisper, auto language)" : "Listening to the speech (Whisper)", null);
      heard = await listenWhisper(audioPath, project.sourceLanguage, signal);
      if (heard.language === "my") throw new Error("The video already speaks Burmese. If that is wrong, choose its language in Source language.");
      // Chinese is FunASR's language; it hears it better than Whisper does.
      if (project.sourceLanguage === "auto" && heard.language === "zh") {
        onProgress("Chinese detected — listening again (FunASR)", null);
        heard = await listenFunAsr(audioPath, signal);
      }
    }
    checkHeardSpeech(heard.segments, heard.language);
    const raw: RecapV2AsrTranscript = { sourceObjectKey: project.sourceObjectKey, ...heard };
    await putObject(recapV2AsrKey(project.id), Buffer.from(JSON.stringify(raw)), "application/json");
    return { units: unitsFrom(project, raw), language: heard.language };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
