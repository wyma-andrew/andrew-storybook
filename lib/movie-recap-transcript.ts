import { downloadMovieRecapSource } from "./movie-recap-source-download";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describeMovieRecapTranscriptScenes, retellInBurmese, type TranscriptCastMember, type TranscriptSegment } from "./openai";
import { readSourceCaptions } from "./movie-recap-captions";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import { ASR_NOT_CONFIGURED, asrWorkerConfigured, transcribeWithAsrWorker } from "./asr-worker";
import { trimFailureMessage } from "./movie-recap";
import { detectScenes, extractKeyframes } from "./movie-recap-scenes";
import { buildAutoSourceTranscript, dialogueDuring, dropUnreliableSegments } from "./movie-recap-source-transcript";
import { MOVIE_RECAP_KEYFRAMES_PER_SCENE } from "./constants/movie-recap";
import type { MovieRecapProject, MovieRecapTranscriptStage } from "./api/types";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// Opus at 16kbps mono is ~1,870 bytes a second, small enough to POST a
// feature film's audio in one request. It is a speech codec at a speech
// bitrate: transcribing the same clip as WAV and as Opus returned the same
// dialogue apart from one proper noun.
const TRANSCRIBE_AUDIO_BITRATE = "16k";

// How much source wording goes into one retelling request. A feature's
// transcript is far past what one call can be handed, so it is retold in
// passages and the passages are joined. Each one is a stretch of story rather
// than a handful of lines, because the point is narrative flow — a small chunk
// would produce a retelling with nothing to narrate.
const STORY_CHUNK_CHARS = 12000;

const PROGRESS_WRITE_INTERVAL_MS = 1500;

// Sequential, because each batch hands the cast and the last description to
// the next one.
const VISION_BATCH_SCENES = 8;

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

// The self-hosted speech worker (FunASR), with the audio compressed first. Extracted so the caller reads as
// the one decision it is: use the source's captions, or listen to it.
async function transcribeSource(
  localSource: string,
  workDir: string,
  onProgress: TranscriptReadProgress,
  signal: AbortSignal
): Promise<TranscriptSegment[]> {
  // No paid fallback: an unconfigured worker is an error, not a reason to call
  // OpenAI's whisper-1 (see history/movie-recap.md).
  if (!asrWorkerConfigured()) throw new Error(ASR_NOT_CONFIGURED);
  await onProgress("extracting_audio");
  const audioPath = path.join(workDir, "audio.ogg");
  await run(
    FFMPEG,
    ["-y", "-i", localSource, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", TRANSCRIBE_AUDIO_BITRATE, audioPath],
    signal
  );
  await onProgress("transcribing");
  const { segments } = await transcribeWithAsrWorker(audioPath, { signal });
  return dropUnreliableSegments(segments).map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }));
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

// What is on screen, one English sentence per detected scene, so a source with
// little dialogue still gives the translator something to narrate.
async function readSourceScenes(
  localSource: string,
  workDir: string,
  dialogue: TranscriptSegment[],
  onProgress: TranscriptProgress,
  signal: AbortSignal
) {
  await onProgress("detecting_scenes");
  const { scenes } = await detectScenes(localSource, workDir, signal);
  const keyframes = await extractKeyframes(
    FFMPEG,
    localSource,
    scenes,
    workDir,
    MOVIE_RECAP_KEYFRAMES_PER_SCENE,
    signal,
    (done, total) => onProgress("detecting_scenes", done, total)
  );

  await onProgress("describing_scenes", 0, scenes.length);
  const visuals = new Map<number, string>();
  let cast: TranscriptCastMember[] = [];
  let previousVisual = "";
  for (let start = 0; start < keyframes.length; start += VISION_BATCH_SCENES) {
    const batch = await Promise.all(
      keyframes.slice(start, start + VISION_BATCH_SCENES).map(async (keyframe) => {
        const scene = scenes[keyframe.index];
        return {
          index: keyframe.index,
          startS: scene.start,
          endS: scene.end,
          dialogue: dialogueDuring(dialogue, scene.start, scene.end),
          frames: await Promise.all(keyframe.files.map(async (file) => (await readFile(file)).toString("base64"))),
        };
      })
    );
    const described = await describeMovieRecapTranscriptScenes({ cast, previousVisual, scenes: batch }, signal);
    cast = described.cast;
    for (const entry of described.scenes) {
      if (!batch.some((scene) => scene.index === entry.sceneIndex)) continue;
      const visual = entry.visual.trim();
      visuals.set(entry.sceneIndex, visual);
      if (visual) previousVisual = visual;
    }
    await onProgress("describing_scenes", Math.min(start + VISION_BATCH_SCENES, scenes.length), scenes.length);
  }
  return scenes.map((scene, index) => ({ start: scene.start, visual: visuals.get(index) ?? "" }));
}

/**
 * The Transcript step's automatic read: the source's dialogue (subtitle track or
 * Whisper) interleaved with what each detected scene shows, written to
 * `transcript_text` as the same timestamped lines a pasted transcript has. The
 * Burmese story is still the user's — see history/movie-recap.md. With
 * `storyOnly`, the parked retelling is redone from the stored transcript.
 */
export async function runMovieRecapTranscript(db: Db, project: MovieRecapProject, { storyOnly = false, dialogueOnly = false } = {}) {
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

    const done = {
      transcript_status: "done",
      transcript_stage: null,
      transcript_progress_current: null,
      transcript_progress_total: null,
      transcript_progress_partial: null,
      transcript_error: null,
    };

    // Retelling again runs on the transcript already stored: the source is not
    // downloaded, and Whisper is not paid for a second time.
    if (storyOnly) {
      const segments = project.transcript ?? [];
      if (!segments.length) throw new Error("No speech was found in the source.");
      const story = await retellTranscript(segments, setProgress, signal);
      await db.from("movie_recap_projects").update({ ...done, transcript_story: story }).eq("id", project.id);
      return;
    }

    await setProgress("downloading_source");
    const localSource = path.join(workDir, "source.mp4");
    await downloadMovieRecapSource(project, localSource, { signal });

    const read = await readSourceTranscript(localSource, workDir, project.sourceDurationSeconds, setProgress, signal);
    const scenes = dialogueOnly ? [] : await readSourceScenes(localSource, workDir, read.segments, setProgress, signal);
    const text = buildAutoSourceTranscript(read.segments, scenes);
    if (!text) throw new Error(dialogueOnly ? "No speech was found in the source." : "Nothing was read from the source: no speech and no scene descriptions.");

    await db
      .from("movie_recap_projects")
      .update({ ...done, transcript: read.segments, transcript_source: read.source, transcript_text: text })
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
