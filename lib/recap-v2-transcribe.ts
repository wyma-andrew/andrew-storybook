import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ASR_NOT_CONFIGURED, asrWorkerConfigured, transcribeWithAsrWorker } from "./asr-worker";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { downloadObjectToFile, getObjectText, putObject, recapV2AsrKey } from "./r2";
import { buildRecapV2Units, type RecapV2Project } from "./recap-v2";
import type { RecapV2JobProgress } from "./recap-v2-job";

type RecapV2AsrTranscript = {
  sourceObjectKey: string;
  segments: { start: number; end: number; text: string }[];
  words: { word: string; start: number; end: number }[];
};

export async function resplitRecapV2(project: RecapV2Project) {
  const text = await getObjectText(recapV2AsrKey(project.id));
  const raw = text ? JSON.parse(text) as RecapV2AsrTranscript : null;
  if (!raw || raw.sourceObjectKey !== project.sourceObjectKey) {
    throw new Error("This project has no saved speech transcript yet. Transcribe it once; after that, lines can be re-split for free.");
  }
  const units = buildRecapV2Units(raw.segments, raw.words, project.sourceDurationSeconds);
  if (!units.length) throw new Error("No speech was found in this video.");
  return units;
}

export async function transcribeRecapV2(project: RecapV2Project, onProgress: RecapV2JobProgress, signal?: AbortSignal) {
  if (!asrWorkerConfigured()) throw new Error(ASR_NOT_CONFIGURED);
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
    onProgress("Listening to the speech (FunASR)", null);
    const { segments, words } = await transcribeWithAsrWorker(audioPath, { signal, words: true });
    const raw: RecapV2AsrTranscript = { sourceObjectKey: project.sourceObjectKey, segments, words };
    await putObject(recapV2AsrKey(project.id), Buffer.from(JSON.stringify(raw)), "application/json");
    const units = buildRecapV2Units(segments, words, project.sourceDurationSeconds);
    if (!units.length) throw new Error("No speech was found in this video.");
    return units;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
