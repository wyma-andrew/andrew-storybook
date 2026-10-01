import { readFile } from "node:fs/promises";
import type { AsrSegment } from "./movie-recap-source-transcript";

export type AsrWord = { word: string; start: number; end: number };

export const ASR_NOT_CONFIGURED = "The speech worker is not configured. Set ASR_WORKER_URL and ASR_WORKER_TOKEN.";

export function asrWorkerConfigured() {
  return Boolean(process.env.ASR_WORKER_URL?.trim());
}

// The self-hosted FunASR Paraformer-zh on Modal (workers/funasr). A long source runs past
// Modal's 150s HTTP window; Modal then answers 303 to a result URL, which fetch
// follows on its own.
export async function transcribeWithAsrWorker(
  audioPath: string,
  { signal, words = false }: { signal?: AbortSignal; words?: boolean } = {}
): Promise<{ segments: AsrSegment[]; words: AsrWord[] }> {
  const url = process.env.ASR_WORKER_URL?.trim();
  if (!url) throw new Error(ASR_NOT_CONFIGURED);
  const token = process.env.ASR_WORKER_TOKEN?.trim();
  const response = await fetch(words ? `${url}?words=true` : url, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: await readFile(audioPath),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Speech worker failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { segments?: AsrSegment[]; words?: AsrWord[] };
  return { segments: data.segments ?? [], words: data.words ?? [] };
}
