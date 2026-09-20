import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openai, retellInBurmese, type TranscriptSegment } from "./openai";
import { readSourceCaptions } from "./movie-recap-captions";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { trimFailureMessage } from "./movie-recap";
import type { MovieRecapProject, MovieRecapTranscriptStage } from "./api/types";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// Whisper rejects an upload over 25MB. That is a real ceiling on this feature,
// not a formality: the extraction used to be 16kHz mono PCM, which is 32,000
// bytes a second, so anything longer than about 13.6 MINUTES failed — and the
// whole point is recapping feature-length films. Measured on a 131s source:
// 4,204,190 bytes of WAV against 245,693 of Opus.
//
// Opus at 16kbps mono is ~1,870 bytes a second, which puts the ceiling near 3.9
// hours and covers any film. It is a speech codec at a speech bitrate, so the
// quality cost is small: transcribing the same clip as WAV and as Opus returned
// the same dialogue apart from one proper noun. The narration prompt summarizes
// rather than quotes, so that is a fair trade for the feature working at all.
const TRANSCRIBE_AUDIO_BITRATE = "16k";
const WHISPER_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// How much source wording goes into one retelling request. A feature's
// transcript is far past what one call can be handed, so it is retold in
// passages and the passages are joined. Each one is a stretch of story rather
// than a handful of lines, because the point is narrative flow — a small chunk
// would produce a retelling with nothing to narrate.
const STORY_CHUNK_CHARS = 12000;

const PROGRESS_WRITE_INTERVAL_MS = 1500;

export type TranscriptProgress = (
  stage: MovieRecapTranscriptStage,
  current?: number | null,
  total?: number | null,
  // 0-100 through the passage in flight. Only the retelling reports it.
  partial?: number | null
) => PromiseLike<unknown>;

// The stages `readSourceTranscript` itself reports — a subset, because the
// render calls it too and its own stage union has no "translating".
export type TranscriptReadStage = "reading_captions" | "extracting_audio" | "transcribing";
export type TranscriptReadProgress = (stage: TranscriptReadStage) => PromiseLike<unknown>;

// Whisper, with the audio compressed first. Extracted so the caller reads as
// the one decision it is: use the source's captions, or listen to it.
async function transcribeSource(
  localSource: string,
  workDir: string,
  onProgress: TranscriptReadProgress,
  signal: AbortSignal
): Promise<TranscriptSegment[]> {
  await onProgress("extracting_audio");
  const audioPath = path.join(workDir, "audio.ogg");
  await run(
    FFMPEG,
    ["-y", "-i", localSource, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", TRANSCRIBE_AUDIO_BITRATE, audioPath],
    signal
  );
  // Checked rather than assumed: the ceiling is wide but not infinite, and the
  // API's own error for an oversized upload does not say what to do about it.
  const audioBytes = (await stat(audioPath)).size;
  if (audioBytes > WHISPER_MAX_UPLOAD_BYTES) {
    throw new Error(
      `The source is too long to transcribe in one pass (${(audioBytes / 1024 / 1024).toFixed(1)}MB of audio against a 25MB limit).`
    );
  }
  await onProgress("transcribing");
  const transcription = await openai().audio.transcriptions.create(
    { file: createReadStream(audioPath), model: "whisper-1", response_format: "verbose_json" },
    { signal }
  );
  const rawSegments = (transcription as unknown as { segments?: { start: number; end: number; text: string }[] }).segments ?? [];
  return rawSegments.map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }));
}

/**
 * What the source says, and where it came from: its own subtitle track when it
 * has a usable one (exact wording, exact timings, no API call, no upload limit,
 * no wait), otherwise Whisper. Most sources carry no subtitle stream — a
 * download or a cutter export usually strips it — so the caption path fails
 * soft and transcription stays the normal route.
 */
export async function readSourceTranscript(
  localSource: string,
  workDir: string,
  durationSeconds: number,
  onProgress: TranscriptReadProgress,
  signal: AbortSignal
): Promise<{ segments: TranscriptSegment[]; source: "captions" | "whisper" }> {
  await onProgress("reading_captions");
  const captions = await readSourceCaptions(FFMPEG, localSource, workDir, durationSeconds, signal);
  if (captions) {
    console.info(
      `[MovieRecapTranscript] read ${captions.segments.length} cues from the source's ${captions.stream.codec} ` +
        `subtitle track${captions.stream.language ? ` (${captions.stream.language})` : ""} — skipping transcription`
    );
    return { segments: captions.segments, source: "captions" };
  }
  return { segments: await transcribeSource(localSource, workDir, onProgress, signal), source: "whisper" };
}

/**
 * The transcript retold in Burmese as a story, not translated line by line —
 * see history/movie-recap.md. Long sources are retold in passages and the
 * passages joined, because no single call can be handed a feature's dialogue.
 * Each passage is therefore its own narrative; stitching them into one
 * continuous telling is a later problem, as is aligning any of it back to
 * individual source lines.
 */
export async function retellTranscript(
  segments: TranscriptSegment[],
  onProgress: TranscriptProgress,
  signal: AbortSignal
): Promise<string> {
  const chunks: string[] = [];
  let chunk = "";
  for (const segment of segments) {
    const line = segment.text.trim();
    if (!line) continue;
    if (chunk.length && chunk.length + line.length > STORY_CHUNK_CHARS) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += (chunk ? " " : "") + line;
  }
  if (chunk) chunks.push(chunk);

  const passages: string[] = [];
  for (const [index, passage] of chunks.entries()) {
    await onProgress("translating", index, chunks.length, 0);
    // The row is written at most this often: the browser polls every two
    // seconds, so anything faster is a write nobody reads.
    let nextWriteAt = 0;
    const written = await retellInBurmese(passage, signal, (characters) => {
      const now = Date.now();
      if (now < nextWriteAt) return;
      nextWriteAt = now + PROGRESS_WRITE_INTERVAL_MS;
      // Burmese runs shorter than the English it came from and the passage is a
      // condensed retelling, so the input length is an over-estimate — which is
      // what keeps this from hitting 100% before the passage is finished. It is
      // capped anyway: a bar that sits at 99% is honest, one that claims done
      // and then keeps working is not.
      void onProgress("translating", index, chunks.length, Math.min(95, Math.round((characters / passage.length) * 100)));
    });
    passages.push(written);
  }
  return passages.filter(Boolean).join("\n\n");
}

// One transcript run per project at a time, the same projectId -> controller map
// the render uses, so a cancel request can reach an in-flight run. On
// `globalThis` for the reason the render's is: plain module state is wiped by
// every hot reload, which hands the cancel route an empty map while the run it
// should stop carries on (see history/movie-recap.md).
const activeRuns: Map<string, AbortController> = ((globalThis as typeof globalThis & {
  __movieRecapTranscripts?: Map<string, AbortController>;
}).__movieRecapTranscripts ??= new Map());

export function cancelMovieRecapTranscript(projectId: string) {
  const controller = activeRuns.get(projectId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/**
 * Reads the source once, at step 2, and writes the transcript and its Burmese
 * retelling onto the project row — the caller re-reads the row afterwards.
 * The render then uses the stored transcript instead of reading the source for
 * meaning a second time. With `storyOnly`, only the retelling is redone, from
 * the transcript already on the row.
 */
export async function runMovieRecapTranscript(db: Db, project: MovieRecapProject, { storyOnly = false } = {}) {
  const controller = new AbortController();
  activeRuns.set(project.id, controller);
  const signal = controller.signal;
  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-transcript-"));

  const setProgress: TranscriptProgress = (stage, current = null, total = null, partial = null) =>
    db
      .from("movie_recap_projects")
      .update({
        transcript_stage: stage,
        transcript_progress_current: current,
        transcript_progress_total: total,
        transcript_progress_partial: partial,
      })
      .eq("id", project.id);

  try {
    // The route already claimed this row in the statement that won the claim —
    // status, the story-only flag, the cleared error and stage all landed there.

    // Retelling again runs on the transcript already stored: the source is not
    // downloaded, and Whisper is not paid for a second time. It is the only way
    // to reroll wording the user did not like without re-reading the film.
    let segments = project.transcript ?? [];
    let source = project.transcriptSource;
    if (!storyOnly) {
      await setProgress("downloading_source");
      const localSource = path.join(workDir, "source.mp4");
      await run(FFMPEG, ["-y", "-i", project.sourceUrl!, "-c", "copy", localSource], signal);

      const read = await readSourceTranscript(localSource, workDir, project.sourceDurationSeconds, setProgress, signal);
      segments = read.segments;
      source = read.source;
    }
    if (!segments.length) throw new Error("No speech was found in the source.");

    const story = await retellTranscript(segments, setProgress, signal);

    await db
      .from("movie_recap_projects")
      .update({
        transcript: segments,
        transcript_story: story,
        transcript_source: source,
        transcript_status: "done",
        transcript_stage: null,
        transcript_progress_current: null,
        transcript_progress_total: null,
        transcript_progress_partial: null,
        transcript_error: null,
      })
      .eq("id", project.id);
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof Error && error.name === "AbortError");
    await db
      .from("movie_recap_projects")
      .update({
        transcript_status: "failed",
        // The stage stays, the counters go: it is the only record of WHERE the
        // run failed, while "batch 3 of 40" means nothing once it is over.
        transcript_progress_current: null,
        transcript_progress_total: null,
        transcript_progress_partial: null,
        transcript_error: trimFailureMessage(
          cancelled ? "Cancelled." : error instanceof Error ? error.message : "Could not read the source."
        ),
      })
      .eq("id", project.id);
  } finally {
    activeRuns.delete(project.id);
    await rm(workDir, { recursive: true, force: true });
  }
}
