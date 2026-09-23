import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffprobeFor } from "./movie-recap-captions";
import { mapConcurrent } from "./map-concurrent";
import { getObjectBytes, movieRecapNarrationKey, movieRecapNarrationTimingKey, putObject } from "./r2";
import { synthesize } from "./tts/synthesize";
import type { Voice } from "./tts/types";
import { FFMPEG, run } from "./movie-recap-ffmpeg";
import {
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_NARRATION_SAMPLE_RATE,
  MOVIE_RECAP_TARGET_FPS,
} from "./constants/movie-recap";

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

// MP4 duration decimals accumulate rounding at every concat boundary. Encoded
// H.264 has one packet per frame here, so packet count is the exact timeline.
export async function probeVideoFrameCount(file: string, signal?: AbortSignal) {
  const { stdout } = await execFileAsync(
    ffprobeFor(FFMPEG),
    [
      "-v", "error", "-select_streams", "v:0", "-count_packets",
      "-show_entries", "stream=nb_read_packets", "-of", "default=nw=1:nk=1", file,
    ],
    { maxBuffer: 1024 * 1024, signal }
  );
  const value = Number(stdout.trim());
  return Number.isInteger(value) && value > 0 ? value : null;
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
  knownDurationSeconds,
}: {
  projectId: string;
  voice: Voice;
  text: string;
  /** Distinguishes this beat's temp files from the rest; not part of the key. */
  slot: number | string;
  workDir: string;
  signal?: AbortSignal;
  knownDurationSeconds?: number;
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
    const durationSeconds = knownDurationSeconds && knownDurationSeconds > 0
      ? knownDurationSeconds
      : await probeDurationS(wavPath, signal);
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

export type MovieRecapNarrationBeatTiming = {
  beat: number;
  startS: number;
  endS: number;
  durationS: number;
};

export function narrationDurationAtRate(inputDurationS: number, playbackRate: number) {
  return Math.ceil((inputDurationS / playbackRate) * MOVIE_RECAP_TARGET_FPS) / MOVIE_RECAP_TARGET_FPS;
}

export async function renderNarrationClipAtConfiguredRate({
  inputPath,
  inputDurationS,
  outputPath,
  signal,
  playbackRate = MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
}: {
  inputPath: string;
  inputDurationS: number;
  outputPath: string;
  signal?: AbortSignal;
  playbackRate?: number;
}) {
  const durationS = narrationDurationAtRate(inputDurationS, playbackRate);
  await run(
    FFMPEG,
    [
      "-y", "-i", inputPath, "-af", `atempo=${playbackRate},apad`, "-t", durationS.toFixed(3),
      "-ar", String(MOVIE_RECAP_NARRATION_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", outputPath,
    ],
    signal
  );
  return durationS;
}

function masterHash(voice: Voice, texts: string[], playbackRate: number) {
  const rate = voice.providerId === "azure" ? voice.params.rate : undefined;
  const clips = texts.map((text) => narrationHash(voice, text, rate));
  return createHash("sha256")
    .update(`${clips.join("\n")}\n@master-rate:${playbackRate}`)
    .digest("hex")
    .slice(0, 32);
}

export function narrationMasterObjectKeys(
  projectId: string,
  voice: Voice,
  texts: string[],
  playbackRate: number
) {
  const hash = masterHash(voice, texts, playbackRate);
  return {
    audioKey: movieRecapNarrationKey(projectId, `master-${hash}`),
    timingKey: movieRecapNarrationTimingKey(projectId, `master-${hash}`),
  };
}

function parseMasterTimings(bytes: Buffer | null, beatCount: number) {
  if (!bytes) return null;
  try {
    const timings = JSON.parse(bytes.toString("utf8")) as MovieRecapNarrationBeatTiming[];
    return timings.length === beatCount && timings.every((timing, index) => (
      timing.beat === index + 1 &&
      Number.isFinite(timing.startS) &&
      Number.isFinite(timing.endS) &&
      Number.isFinite(timing.durationS)
    )) ? timings : null;
  } catch {
    return null;
  }
}

export function replaceNarrationBeatTiming(
  timings: MovieRecapNarrationBeatTiming[],
  beatIndex: number,
  durationS: number
) {
  const replaced = timings[beatIndex];
  if (!replaced || !(durationS > 0)) throw new Error("That beat has no saved narration timing.");
  const deltaS = durationS - replaced.durationS;
  return timings.map((timing, index) => {
    if (index < beatIndex) return timing;
    if (index === beatIndex) {
      return { ...timing, endS: timing.startS + durationS, durationS };
    }
    return { ...timing, startS: timing.startS + deltaS, endS: timing.endS + deltaS };
  });
}

export async function replaceNarrationMasterBeat({
  projectId,
  voice,
  previousTexts,
  nextTexts,
  beatIndex,
  replacementClip,
  workDir,
  previousPlaybackRate,
  playbackRate = MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
}: {
  projectId: string;
  voice: Voice;
  previousTexts: string[];
  nextTexts: string[];
  beatIndex: number;
  replacementClip: { path: string; durationSeconds: number };
  workDir: string;
  previousPlaybackRate?: number;
  playbackRate?: number;
}) {
  if (
    previousTexts.length !== nextTexts.length ||
    !previousTexts[beatIndex] ||
    !nextTexts[beatIndex] ||
    previousPlaybackRate !== playbackRate
  ) return null;

  const previousKeys = narrationMasterObjectKeys(projectId, voice, previousTexts, previousPlaybackRate);
  const nextKeys = narrationMasterObjectKeys(projectId, voice, nextTexts, playbackRate);
  const [cachedNextAudio, cachedNextTiming] = await Promise.all([
    getObjectBytes(nextKeys.audioKey),
    getObjectBytes(nextKeys.timingKey),
  ]);
  const cachedNextTimings = parseMasterTimings(cachedNextTiming, nextTexts.length);
  const narrationPath = path.join(workDir, "narration.wav");
  if (cachedNextAudio && cachedNextTimings) {
    await writeFile(narrationPath, cachedNextAudio);
    return { path: narrationPath, timings: cachedNextTimings, cached: true, ...nextKeys, previousKeys, clipDurations: [] };
  }

  const [previousAudio, previousTiming] = await Promise.all([
    getObjectBytes(previousKeys.audioKey),
    getObjectBytes(previousKeys.timingKey),
  ]);
  const previousTimings = parseMasterTimings(previousTiming, previousTexts.length);
  if (!previousAudio || !previousTimings) return null;

  const previousPath = path.join(workDir, "previous-narration.wav");
  const replacementPath = path.join(workDir, `replacement-${beatIndex}.wav`);
  await writeFile(previousPath, previousAudio);
  const replacementDurationS = await renderNarrationClipAtConfiguredRate({
    inputPath: replacementClip.path,
    inputDurationS: replacementClip.durationSeconds,
    outputPath: replacementPath,
    playbackRate,
  });

  const replaced = previousTimings[beatIndex];
  const previousEndS = previousTimings.at(-1)?.endS ?? 0;
  const parts: string[] = [];
  if (replaced.startS > 0) {
    const prefixPath = path.join(workDir, "narration-prefix.wav");
    await run(FFMPEG, [
      "-y", "-i", previousPath, "-t", replaced.startS.toFixed(6),
      "-ar", String(MOVIE_RECAP_NARRATION_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", prefixPath,
    ]);
    parts.push(prefixPath);
  }
  parts.push(replacementPath);
  if (replaced.endS < previousEndS) {
    const suffixPath = path.join(workDir, "narration-suffix.wav");
    await run(FFMPEG, [
      "-y", "-ss", replaced.endS.toFixed(6), "-i", previousPath,
      "-t", (previousEndS - replaced.endS).toFixed(6),
      "-ar", String(MOVIE_RECAP_NARRATION_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", suffixPath,
    ]);
    parts.push(suffixPath);
  }

  const listPath = path.join(workDir, "narration-replacement.txt");
  await writeFile(listPath, parts.map((part) => `file '${part}'`).join("\n"));
  await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", narrationPath]);

  const timings = replaceNarrationBeatTiming(previousTimings, beatIndex, replacementDurationS);
  const expectedDurationS = timings.at(-1)?.endS ?? 0;
  const actualDurationS = await probeDurationS(narrationPath);
  if (!actualDurationS || Math.abs(actualDurationS - expectedDurationS) > 1 / MOVIE_RECAP_TARGET_FPS) {
    return null;
  }

  await Promise.all([
    putObject(nextKeys.audioKey, await readFile(narrationPath), "audio/wav"),
    putObject(nextKeys.timingKey, Buffer.from(JSON.stringify(timings)), "application/json"),
  ]);
  return { path: narrationPath, timings, cached: false, ...nextKeys, previousKeys, clipDurations: [] };
}

/**
 * Materialize and cache the narration master plus its beat boundaries.
 *
 * The cache key contains only voice/audio inputs. Video speed and source-edit
 * settings are deliberately absent, so changing the picture never regenerates
 * narration. The configured overall audio rate is present because it changes
 * the WAV and beat boundaries. Individual clips remain content-addressed;
 * rebuilding after an edit synthesizes only the changed beat and reuses every
 * other clip.
 */
export async function ensureNarrationMaster({
  projectId,
  voice,
  texts,
  workDir,
  signal,
  clips: suppliedClips,
  knownClipDurations,
  beforeClip,
  onClipReady,
  playbackRate = MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
}: {
  projectId: string;
  voice: Voice;
  texts: string[];
  workDir: string;
  signal?: AbortSignal;
  clips?: { path: string; durationSeconds: number; cached: boolean }[];
  knownClipDurations?: (number | undefined)[];
  beforeClip?: (index: number) => Promise<void>;
  onClipReady?: (index: number) => Promise<void>;
  playbackRate?: number;
}) {
  const { audioKey, timingKey } = narrationMasterObjectKeys(projectId, voice, texts, playbackRate);
  const narrationPath = path.join(workDir, "narration.wav");
  const [cachedAudio, cachedTiming] = await Promise.all([
    getObjectBytes(audioKey),
    getObjectBytes(timingKey),
  ]);
  if (cachedAudio && cachedTiming) {
    try {
      const timings = parseMasterTimings(cachedTiming, texts.length);
      if (timings) {
        await writeFile(narrationPath, cachedAudio);
        return { path: narrationPath, timings, cached: true, audioKey, timingKey, clipDurations: knownClipDurations ?? [] };
      }
    } catch {
      // Rebuild both objects when either cache member is incomplete or invalid.
    }
  }

  const clips = suppliedClips ?? await mapConcurrent(texts, 6, async (text, index) => {
    await beforeClip?.(index);
    const clip = await narrationClip({
      projectId,
      voice,
      text,
      slot: `master-${index}`,
      workDir,
      signal,
      knownDurationSeconds: knownClipDurations?.[index],
    });
    await onClipReady?.(index);
    return clip;
  });

  const renderedParts = await mapConcurrent(clips, 4, async (clip, index) => {
    const partPath = path.join(workDir, `narration-track-part-${index}.wav`);
    const durationS = await renderNarrationClipAtConfiguredRate({
      inputPath: clip.path,
      inputDurationS: clip.durationSeconds,
      outputPath: partPath,
      signal,
      playbackRate,
    });
    return { partPath, durationS };
  });
  const timings: MovieRecapNarrationBeatTiming[] = [];
  let cursor = 0;
  for (const [index, { durationS }] of renderedParts.entries()) {
    timings.push({ beat: index + 1, startS: cursor, endS: cursor + durationS, durationS });
    cursor += durationS;
  }

  const listPath = path.join(workDir, "narration-master.txt");
  await writeFile(listPath, renderedParts.map(({ partPath }) => `file '${partPath}'`).join("\n"));
  await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", narrationPath], signal);
  await Promise.all([
    putObject(audioKey, await readFile(narrationPath), "audio/wav"),
    putObject(timingKey, Buffer.from(JSON.stringify(timings)), "application/json"),
  ]);
  return {
    path: narrationPath,
    timings,
    cached: false,
    audioKey,
    timingKey,
    clipDurations: clips.map((clip) => clip.durationSeconds),
  };
}
