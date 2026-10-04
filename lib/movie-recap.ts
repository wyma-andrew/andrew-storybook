import {
  MOVIE_RECAP_MOCK_SKIPPED_STEPS,
  MOVIE_RECAP_PARKED_STEPS,
  MOVIE_RECAP_PLAYBACK_SPEED,
  MOVIE_RECAP_SCRIPT_STEPS,
  MOVIE_RECAP_RENDER_STEPS,
  MOVIE_RECAP_AUTO_READ_SKIPPED_STEPS,
  MOVIE_RECAP_DIALOGUE_ONLY_SKIPPED_STEPS,
  MOVIE_RECAP_STORY_ONLY_SKIPPED_STEPS,
  MOVIE_RECAP_TRANSCRIPT_STEPS,
} from "./constants/movie-recap";
import type {
  MovieRecapNarrationSegment,
  MovieRecapProject,
  MovieRecapRenderStage,
  MovieRecapTranscriptStage,
} from "./api/types";

const MIB = 1024 * 1024;
const MIN_PART_SIZE = 16 * MIB;
const MAX_PARTS = 10_000;

export function movieRecapPartSize(sizeBytes: number) {
  const needed = Math.ceil(sizeBytes / MAX_PARTS);
  return Math.max(MIN_PART_SIZE, Math.ceil(needed / MIB) * MIB);
}

export function movieRecapPartCount(sizeBytes: number, partSize = movieRecapPartSize(sizeBytes)) {
  return Math.ceil(sizeBytes / partSize);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function clampBlurRect(rect: { x: number; y: number; width: number; height: number }) {
  const width = Math.min(100, Math.max(5, rect.width));
  const height = Math.min(100, Math.max(5, rect.height));
  return {
    width,
    height,
    x: Math.min(100 - width, Math.max(0, rect.x)),
    y: Math.min(100 - height, Math.max(0, rect.y)),
  };
}


// What a freshly uploaded source should be rendered as. Called once, at upload,
// and never again: seeding on anything other than an explicit action fights the
// user, which is the mistake the zoom default made (history/movie-recap.md).
//
// `contain` is the stable default for every source shape so a fresh project
// preserves the full picture. The user can still choose `cover` explicitly.
//
// CAVEAT: `videoWidth`/`videoHeight` in the browser ignore rotation metadata. A
// phone video shot in portrait often reports 1920x1080 with a 90-degree flag, and
// the browser does not expose the flag, so this can call it landscape. That is
// why the result is a DEFAULT the user can change, not a decision.
export function suggestMovieRecapFraming(width: number, height: number) {
  if (width === height) {
    return {
      aspectRatio: "1:1" as const,
      fitMode: "contain" as const,
    };
  }
  const portrait = height > width;
  return {
    aspectRatio: portrait ? ("9:16" as const) : ("16:9" as const),
    fitMode: "contain" as const,
  };
}


// How much of a failure message reaches the project row.
//
// ffmpeg writes its whole banner to stderr — version, build flags, every codec
// warning — and `execFile` hands all of it back on a non-zero exit. One real
// failure stored 85,975 characters. The row is re-read every two seconds while a
// render runs, so a message that size rides along on every poll, and the one
// line that says what actually went wrong is buried in it.
//
// The HEAD is kept because it names the command that failed, and the TAIL
// because that is where ffmpeg puts the reason. The middle is the banner.
const ERROR_HEAD_CHARS = 300;
const ERROR_TAIL_CHARS = 1500;

export function trimFailureMessage(message: string) {
  const text = message.trim();
  if (text.length <= ERROR_HEAD_CHARS + ERROR_TAIL_CHARS) return text;
  const skipped = text.length - ERROR_HEAD_CHARS - ERROR_TAIL_CHARS;
  return `${text.slice(0, ERROR_HEAD_CHARS)}\n… ${skipped} characters trimmed …\n${text.slice(-ERROR_TAIL_CHARS)}`;
}

// FNV-1a over a stable key. Weak on purpose — all it has to do is spread
// neighbouring shots across different values, and it has to give the same answer
// on a re-render, or the same project renders to two different files.
function hashOf(key: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// Which way a held shot's picture slides while it pushes in (see
// holdMotionFilter). Deterministic, so a re-render produces the same file.
// Neighbouring shots get different directions, so a run of held shots does not
// all drift the same way and read as one long camera move across the cuts.
export function pickHoldDrift(projectId: string, beatIndex: number, shotIndex: number) {
  const hash = hashOf(`${projectId}:hold:${beatIndex}:${shotIndex}`);
  return { driftX: (hash % 3) - 1, driftY: (Math.floor(hash / 3) % 3) - 1 };
}

// What a step in the render progress bar should show.
//
// Derived from the row rather than tracked separately: `render_status` and
// `render_stage` are already what the client polls, so the bar cannot disagree
// with the status text beside it.
export type MovieRecapStepState = "pending" | "active" | "done" | "skipped" | "failed";

type Step = { id: string; label: string; stages: readonly string[] };

function stepStates(
  steps: readonly Step[],
  status: "idle" | "running" | "done" | "failed",
  stage: string | null,
  skippedIds: readonly string[]
): Record<string, MovieRecapStepState> {
  const skipped = new Set<string>(skippedIds);
  const currentIndex = stage ? steps.findIndex((step) => step.stages.includes(stage)) : -1;

  const states: Record<string, MovieRecapStepState> = {};
  for (const [index, step] of steps.entries()) {
    if (skipped.has(step.id)) {
      // A skipped step stays skipped even once the render finishes — a mock did
      // not do it, and a finished bar claiming otherwise would be a lie.
      states[step.id] = "skipped";
      continue;
    }
    if (status === "idle") {
      states[step.id] = "pending";
      continue;
    }
    if (status === "done") {
      states[step.id] = "done";
      continue;
    }
    // Running or failed. An unknown stage (null, or one not in any group) leaves
    // currentIndex at -1, which marks everything pending rather than guessing —
    // better a bar that has not started than one claiming finished work.
    if (currentIndex === -1) {
      states[step.id] = "pending";
      continue;
    }
    if (index < currentIndex) states[step.id] = "done";
    else if (index > currentIndex) states[step.id] = "pending";
    else states[step.id] = status === "failed" ? "failed" : "active";
  }
  return states;
}

export function movieRecapRenderStepStates({
  status,
  stage,
  isMock,
}: {
  status: MovieRecapProject["renderStatus"];
  stage: MovieRecapRenderStage | null;
  isMock: boolean;
}) {
  return stepStates(MOVIE_RECAP_RENDER_STEPS, status, stage, [
    ...MOVIE_RECAP_PARKED_STEPS,
    ...(isMock ? MOVIE_RECAP_MOCK_SKIPPED_STEPS : []),
  ]);
}

// The script run's own bar. Nothing is parked or skipped on it: every step it
// shows is one that run actually performs.
export function movieRecapScriptStepStates({
  status,
  stage,
}: {
  status: MovieRecapProject["scriptStatus"];
  stage: MovieRecapRenderStage | null;
}) {
  // "ready" is this run's "done": the work finished, and the render is a
  // separate action rather than a step on this bar.
  return stepStates(MOVIE_RECAP_SCRIPT_STEPS, status === "ready" ? "done" : status, stage, []);
}

// The transcript step's own bar. A retell-only run never downloads the source or
// reads it, and an automatic read never retells, so those show skipped for the same reason a mock render's
// do: a bar claiming work that did not happen is a bar telling a lie.
export function movieRecapTranscriptStepStates({
  status,
  stage,
  storyOnly,
  dialogueOnly = false,
}: {
  status: MovieRecapProject["transcriptStatus"];
  stage: MovieRecapTranscriptStage | null;
  storyOnly: boolean;
  dialogueOnly?: boolean;
}) {
  const skipped = storyOnly
    ? MOVIE_RECAP_STORY_ONLY_SKIPPED_STEPS
    : dialogueOnly
      ? MOVIE_RECAP_DIALOGUE_ONLY_SKIPPED_STEPS
      : MOVIE_RECAP_AUTO_READ_SKIPPED_STEPS;
  return stepStates(MOVIE_RECAP_TRANSCRIPT_STEPS, status, stage, skipped);
}

/**
 * SCREEN seconds behind a beat, which is what its narration has to fit.
 *
 * Not source seconds: every shot plays at MOVIE_RECAP_PLAYBACK_SPEED, so 5.7s of
 * film holds the screen for 6.0s. Reporting the source length here showed
 * overruns the render does not actually have.
 */
export function beatFootageS(beat: MovieRecapNarrationSegment) {
  const sourceS = beat.shots.reduce((total, shot) => total + (shot.sourceEndS - shot.sourceStartS), 0);
  return sourceS / MOVIE_RECAP_PLAYBACK_SPEED;
}

/**
 * How far a beat's narration overruns its footage; 0 when it fits.
 *
 * The number the script step exists to show. A beat with no measurement yet — a
 * script from before measuring existed, or a mock — reports 0 rather than a
 * guess: a red number beside a line that may be fine is worse than none.
 */
export function beatOverrunS(beat: MovieRecapNarrationSegment) {
  // A stale measurement still answers the question better than nothing: it is
  // the previous wording of the same line, not a guess. The row says it is
  // stale; the number stays so a small edit does not blank the column.
  if (typeof beat.audioS !== "number") return 0;
  return Math.max(0, Number((beat.audioS - beatFootageS(beat)).toFixed(2)));
}
