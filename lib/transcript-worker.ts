import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { dropUnreliableSegments, type AsrSegment } from "./movie-recap-source-transcript";
import { downloadObjectToFile } from "./r2";
import { transcriptFromSegments } from "./transcript-project";

export const WHISPER_MM_NOT_CONFIGURED = "The Burmese speech worker is not configured. Set WHISPER_MM_WORKER_URL and WHISPER_MM_WORKER_TOKEN.";

export function whisperWorkerConfigured() {
  return Boolean(process.env.WHISPER_MM_WORKER_URL?.trim());
}

// The self-hosted Whisper large-v3 on Modal (workers/whisper-mm). A long source
// runs past Modal's 150s HTTP window; Modal then answers 303 to a result URL,
// which fetch follows on its own. `language: "auto"` lets Whisper detect it.
export async function transcribeWithWhisperWorker(
  audioPath: string,
  { language = "my", signal }: { language?: string; signal?: AbortSignal } = {}
) {
  const url = process.env.WHISPER_MM_WORKER_URL?.trim();
  if (!url) throw new Error(WHISPER_MM_NOT_CONFIGURED);
  const token = process.env.WHISPER_MM_WORKER_TOKEN?.trim();
  const endpoint = new URL(url);
  endpoint.searchParams.set("language", language);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: await readFile(audioPath),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Speech worker failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return ((await response.json()) as { segments?: AsrSegment[] }).segments ?? [];
}

export async function transcribeSourceVideo(sourceObjectKey: string, onStage: (stage: string) => void, signal?: AbortSignal) {
  if (!process.env.WHISPER_MM_WORKER_URL?.trim()) throw new Error(WHISPER_MM_NOT_CONFIGURED);
  const workDir = await mkdtemp(path.join(tmpdir(), "transcript-"));
  try {
    onStage("Downloading video");
    const sourcePath = path.join(workDir, "source");
    await downloadObjectToFile(sourceObjectKey, sourcePath, { signal });
    onStage("Extracting audio");
    const audioPath = path.join(workDir, "audio.ogg");
    await run(FFMPEG, ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "16k", audioPath], signal);
    onStage("Listening to the speech (Whisper)");
    const text = transcriptFromSegments(dropUnreliableSegments(await transcribeWithWhisperWorker(audioPath, { signal })));
    if (!text) throw new Error("No speech was found in this video.");
    return text;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
