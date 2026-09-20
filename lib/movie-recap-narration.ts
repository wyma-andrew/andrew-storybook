import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffprobeFor } from "./movie-recap-captions";
import { getObjectBytes, movieRecapNarrationKey, putObject } from "./r2";
import { synthesize } from "./tts/synthesize";
import type { Voice } from "./tts/types";
import { FFMPEG, run } from "./movie-recap-ffmpeg";

// The narration side of a recap: measuring a clip, trimming it back to the words
// inside it, and deciding whether two beats can share one.
//
// Split out of the render because the SCRIPT run now needs all three as well —
// it synthesizes and measures every beat so the user can see which line has more
// narration than its timestamps cover, and only then is anything cut.

const execFileAsync = promisify(execFile);

// Azure pads every clip it returns with silence — measured at ~0.18s before the
// speech and ~0.81s after it on a 4.85s clip. That silence is part of the file,
// so its duration sizes the beat, and the picture sits on a frame through all of
// it: five beats of narration carried nearly five seconds of dead air. Clips are
// trimmed back to their speech, and a single deliberate gap is added instead.
const SILENCE_THRESHOLD_DB = -40;
// Left either side of the speech so trimming can never clip a soft first or last
// syllable.
//
// The deliberate 0.15s gap that used to follow every beat is gone with the move
// to scene-aligned beats (2026-09-19): a beat is one scene, and its length is
// that scene's footage exactly, so a gap on top of it is time with no picture
// behind it — the freeze it was added to prevent is the freeze it would cause.
// The pause itself did not go: a beat is a whole sentence or two, so the clip
// already starts and ends on one and the cut lands in that break.
const SPEECH_MARGIN_S = 0.06;

// What a file ACTUALLY came out as, which is not what it was asked for: every
// segment is cut to `-t slot` and then resampled to a constant frame grid, so
// its real length is a whole number of frames — up to 1/MOVIE_RECAP_TARGET_FPS
// short of its slot. Unreadable duration means "do not compensate".
export async function probeDurationS(file: string, signal?: AbortSignal) {
  const { stdout } = await execFileAsync(
    ffprobeFor(FFMPEG),
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { maxBuffer: 1024 * 1024, signal }
  );
  const value = Number(stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

// What decides whether two beats can share one synthesized clip: the words, the
// voice, and the rate it was read at. Beat NUMBER is deliberately absent —
// reordering the script, or editing one line, must not invalidate the rest.
//
// THE RATE IS PART OF THE KEY, and it is not optional. The same words in the
// same voice come out at different LENGTHS at different reading speeds, and a
// beat is sized from that length — so a cache hit at the wrong speed puts the
// speech off the picture for the rest of the video. Raising
// AZURE_NARRATION_RATE therefore invalidates every clip, which is correct: they
// are the wrong recordings now.
export function narrationHash(voice: { providerId: string; id: string }, text: string, rate?: string | null) {
  const suffix = rate ? `\n@${rate}` : "";
  return createHash("sha256").update(`${voice.providerId}:${voice.id}\n${text}${suffix}`).digest("hex").slice(0, 32);
}

// Cuts a synthesized clip back to the speech inside it. ffmpeg reports where the
// silence runs are; the first non-silent sample and the last are the bounds, with
// SPEECH_MARGIN_S left on either side. A clip that is silent end to end, or that
// ffmpeg reports nothing for, is passed through untouched — better a long beat
// than one with its first word missing.
export async function trimToSpeech(inputPath: string, outputPath: string, durationSeconds: number, signal?: AbortSignal) {
  // ffmpeg writes silencedetect to stderr and exits 0; a failure still carries
  // whatever it managed to report, so both paths feed the same parse.
  const args = ["-hide_banner", "-i", inputPath, "-af", `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=0.1`, "-f", "null", "-"];
  const report = await execFileAsync(FFMPEG, args, { maxBuffer: 1024 * 1024 * 16, signal })
    .then((result) => result.stderr)
    .catch((error: { stderr?: string }) => error.stderr ?? "");

  const starts = [...report.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...report.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // A leading run is one starting at (or just after) zero. A trailing run is one
  // whose END lands on the end of the file: ffmpeg closes the final run at EOF
  // rather than leaving it open, so testing for a missing `silence_end` finds
  // nothing and the clip keeps its tail.
  const leading = starts.length && starts[0] <= 0.05 && ends.length ? ends[0] : 0;
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  const closesAtEof = ends.length === starts.length && lastEnd >= durationSeconds - 0.02;
  const trailing = closesAtEof || ends.length < starts.length ? starts[starts.length - 1] : durationSeconds;

  const from = Math.max(0, leading - SPEECH_MARGIN_S);
  const to = Math.min(durationSeconds, trailing + SPEECH_MARGIN_S);
  // Nothing usable detected, or the clip is silence end to end: pass it through
  // rather than risk cutting a word off.
  if (!(to > from) || to - from < 0.2) return { path: inputPath, durationSeconds };

  await run(FFMPEG, ["-y", "-i", inputPath, "-ss", from.toFixed(3), "-to", to.toFixed(3), "-c:a", "pcm_s16le", outputPath], signal);
  return { path: outputPath, durationSeconds: Number((to - from).toFixed(3)) };
}


/**
 * One beat's audio, from the cache when the same words have been read before.
 *
 * The cached object IS the trimmed clip, so its length is measured back off the
 * file rather than stored beside it: one source of truth, and a number that
 * cannot drift from the audio it describes. That length is what sizes the beat's
 * video, so it has to be right.
 *
 * Cached by content, which is what makes the script step affordable — fixing one
 * line re-reads that line and nothing else.
 */
export async function narrationClip({
  projectId,
  voice,
  text,
  slot,
  workDir,
  signal,
}: {
  projectId: string;
  voice: Voice;
  text: string;
  /** Distinguishes this beat's temp files from the rest; not part of the key. */
  slot: number | string;
  workDir: string;
  signal?: AbortSignal;
}): Promise<{ path: string; durationSeconds: number; cached: boolean }> {
  const wavPath = path.join(workDir, `narration-${slot}.wav`);
  // The voice's own rate is part of the key. Raising AZURE_NARRATION_RATE
  // changes how long every line takes to say, and beats are sized from that
  // measurement — without the rate here, a cache written at the old speed would
  // be served against the new sizing and the speech would drift off the picture
  // for the rest of the video.
  const rate = voice.providerId === "azure" ? voice.params.rate : undefined;
  const cacheKey = movieRecapNarrationKey(projectId, narrationHash(voice, text, rate));
  const cached = await getObjectBytes(cacheKey);
  if (cached) {
    await writeFile(wavPath, cached);
    const durationSeconds = await probeDurationS(wavPath, signal);
    if (durationSeconds) return { path: wavPath, durationSeconds, cached: true };
    // Unreadable: fall through and synthesize it again rather than size a beat
    // against a guessed length.
  }
  const result = await synthesize({ text, voice, rate, signal });
  const rawPath = path.join(workDir, `narration-${slot}-raw.wav`);
  await writeFile(rawPath, result.audio);
  const trimmed = await trimToSpeech(rawPath, wavPath, result.durationSeconds, signal);
  // `trimToSpeech` returns its INPUT when there was nothing worth trimming, so
  // cache whatever it actually chose, not `wavPath`.
  await putObject(cacheKey, await readFile(trimmed.path), "audio/wav");
  return { path: trimmed.path, durationSeconds: trimmed.durationSeconds, cached: false };
}
