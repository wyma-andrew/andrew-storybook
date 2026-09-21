// Shot planning for a narration beat: how many cuts it gets, which piece of the
// source each one plays, and the one rule none of it may break —
// MAX_CONTINUOUS_SOURCE_S.
//
// It lives apart from the render because it is pure arithmetic that decides
// every cut in the video, and because the invariant below is only checkable in
// a test if nothing around it needs ffmpeg.

import {
  MOVIE_RECAP_EDIT,
  MOVIE_RECAP_NARRATION_MAX_PLAYBACK_RATE,
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_PLAYBACK_SPEED,
  MOVIE_RECAP_TARGET_FPS,
  type MovieRecapPacing,
} from "./constants/movie-recap";

export type SourceWindow = {
  sourceStartS: number;
  sourceEndS: number;
  /**
   * Where inside this scene the vision pass described, as a fraction of its
   * length — the moment a shot has to contain. Absent on windows the planner
   * invented itself (a borrowed spare keeps its own; a sub-split window has no
   * described moment of its own), which fall back to KEYFRAME_FRACTION.
   */
  keyframeFraction?: number;
};
/** Per-bucket picture motion across the source; see lib/movie-recap-scenes.ts. */
export type MotionTrack = { stepS: number; values: number[] };

// A beat is cut into shots rather than holding one clip for its whole length —
// real recaps cut every second or two under a continuous line, and a single
// held shot is what made the pacing drag.
//
// The four numbers that decide all of it — the shot band, the borrowing target
// and the hard continuity limit — are NOT constants any more. They differ per
// aspect ratio, which is the format: see MOVIE_RECAP_PACING in
// lib/constants/movie-recap.ts for the values and why they differ. They arrive
// here as `pacing` on every entry point, so this module has no opinion about
// which video it is planning.
// Two windows this close are treated as JOINING, even though a gap exists.
// Raised from 0.15s, which only covered the rounding of scene boundaries: a real
// export played three pairs that skipped just 0.29-0.47s of film, and each ran
// ~3.5s on screen. Formally those were cuts; to the eye, skipping a third of a
// second inside the same scene and carrying on is one unbroken clip, which is
// what MAX_CONTINUOUS_SOURCE_S exists to prevent.
export const CONTINUITY_EPSILON_S = 0.5;
// A skip smaller than this does not read as a cut — it reads as a dropped
// frame. Used both to break an adjacent pair apart and to space the sub-windows
// of a split scene. It has to stay ABOVE CONTINUITY_EPSILON_S, or breaking a
// pair would land it exactly on the threshold it is trying to clear.
export const MIN_JUMP_S = 0.75;
// Never leave a window shorter than this behind when opening a gap: below it the
// shot is mostly freeze-padding.
const MIN_WINDOW_S = 0.5;
// How much a window may drift from the described moment to find livelier
// footage, priced against motion: a window has to beat the scene's own average
// by 15% per second of drift to be worth moving to. Measured on a real export,
// the shots that read as frozen ran at a third of the opening's motion inside
// scenes that had moving footage elsewhere in the same uncut run.
const MOTION_DRIFT_PENALTY = 0.15;
// How many of the nearest spares are considered before motion picks between
// them. Proximity still decides the neighbourhood — borrowed footage has to
// belong to this stretch of the film (2026-09-16) — and motion only chooses
// within it, so a lively scene an hour away can never be pulled in.
const BORROW_CANDIDATES = 6;
// A candidate window pays this, in the same relative-motion units, for every cut
// inside it. Large enough that a cut-free placement always beats one that is not
// — the motion signal is the CUT DETECTOR's own metric and peaks hardest at an
// edit, so without this the scorer hunts for cuts instead of movement.
const CUT_PENALTY = 1000;
// A bucket counts as MOVING when it reaches this share of the film's own median.
// Validated against pixels on a real export: stretches that visibly hold still
// read 0.08-3.8 in `content_val` where moving ones read 5.6-11.5, against a
// median of ~4.2. The boundary between those two groups sits just under the
// median, which is where this puts it.
const STILL_FLOOR_FRACTION = 0.8;
// Sustained movement is what the eye reads, so it carries the score; mean motion
// only breaks ties between windows that move for equally long. Scoring on the
// mean alone let a window sit still for 1.5s and buy its place with one 0.3s
// burst — measured at 30% of a finished recap holding still.
const MEAN_MOTION_WEIGHT = 0.25;

// The film's median bucket, cached per track: the scale everything else is
// judged against, so a grainy print and a clean one behave the same.
const stillFloors = new WeakMap<MotionTrack, number>();
function stillFloor(track: MotionTrack) {
  const cached = stillFloors.get(track);
  if (cached !== undefined) return cached;
  const sorted = track.values.filter((value) => value > 0).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const floor = median * STILL_FLOOR_FRACTION;
  stillFloors.set(track, floor);
  return floor;
}

// What share of a span actually moves. This is the number that decides where a
// shot sits: a window that moves throughout beats one that is still for most of
// its length however lively its best moment.
export function movingFraction(track: MotionTrack, fromS: number, toS: number, cuts: number[] = []) {
  const first = Math.max(0, Math.floor(fromS / track.stepS));
  const last = Math.min(track.values.length - 1, Math.ceil(toS / track.stepS) - 1);
  if (last < first) return 0;
  const floor = stillFloor(track);
  const cutBuckets = new Set(cuts.map((at) => Math.floor(at / track.stepS)));
  let moving = 0;
  let counted = 0;
  for (let i = first; i <= last; i++) {
    if (cutBuckets.has(i)) continue;
    counted++;
    if ((track.values[i] ?? 0) >= floor) moving++;
  }
  return counted ? moving / counted : 0;
}


const round3 = (value: number) => Number(value.toFixed(3));
const lengthOf = (window: SourceWindow) => window.sourceEndS - window.sourceStartS;
const byStart = (a: SourceWindow, b: SourceWindow) => a.sourceStartS - b.sourceStartS;
const midpoint = (window: SourceWindow) => (window.sourceStartS + window.sourceEndS) / 2;

// How many seconds of SOURCE a shot shows, which is not its slot: everything
// plays at MOVIE_RECAP_PLAYBACK_SPEED, so a slot needs `slot * speed` seconds of
// footage and shows all it has when the scene is shorter. Mirrors the two
// branches in the render's segment loop — change one and change both.
export function playedSourceSeconds(windowS: number, slotS: number) {
  return Math.min(slotS * MOVIE_RECAP_PLAYBACK_SPEED, windowS);
}

// Fallback for a window with no described moment of its own: a third of the way
// in, which is where a single keyframe is taken (lib/movie-recap-scenes.ts).
// That frame is what the vision pass described and therefore what the narration
// model picked the scene FOR, so it is the moment a shot has to contain.
//
// A scene described from SEVERAL frames carries its own `keyframeFraction` — the
// model's chosen peak — and uses that instead. Keep this value in step with
// SINGLE_KEYFRAME_FRACTION.
const KEYFRAME_FRACTION = 1 / 3;

// The stretches of a scene with no cut inside them. A "scene" is detection's
// merged unit (>= MIN_SCENE_S), so the film's own edits survive inside it; those
// are the boundaries a shot must not play across, or a planned 1.7s hold arrives
// as two shots of the original film.
function uncutRuns(scene: SourceWindow, cuts: number[]): SourceWindow[] {
  const inside = cuts.filter((at) => at > scene.sourceStartS + 1e-6 && at < scene.sourceEndS - 1e-6).sort((a, b) => a - b);
  if (!inside.length) return [{ ...scene }];
  const runs: SourceWindow[] = [];
  let from = scene.sourceStartS;
  for (const at of [...inside, scene.sourceEndS]) {
    runs.push({ sourceStartS: from, sourceEndS: at });
    from = at;
  }
  return runs;
}

// Which part of a scene a shot actually plays, and the room it has to move.
//
// A scene is usually longer than its slot, and the render used to take the HEAD
// of it — so a 6s scene under a 1.4s slot showed 0-1.4s while the action the
// line is about sat at 2s and never appeared on screen. The window is centred on
// the described moment instead, and kept inside ONE uncut run so the shot is a
// real unbroken hold.
//
// When no run is long enough for the slot, the described moment wins and the
// shot plays across a cut: an original edit inside a shot still looks like film,
// while the alternative — a shorter window freeze-padded out to the slot — looks
// like a bug.
// Mean motion over a span of the source. Out-of-range spans read as 0, which is
// right: a track that does not cover the span cannot argue for it.
//
// Buckets holding a cut are skipped. The track comes from PySceneDetect's
// `content_val`, which is what it thresholds to FIND cuts, so a bucket
// containing one reads as enormous movement when the picture either side of it
// may be still. Counting those made the scorer prefer windows with an edit in
// them — measured as source-cut leakage roughly tripling in one render.
export function motionMean(track: MotionTrack, fromS: number, toS: number, cuts: number[] = []) {
  const first = Math.max(0, Math.floor(fromS / track.stepS));
  const last = Math.min(track.values.length - 1, Math.ceil(toS / track.stepS) - 1);
  if (last < first) return 0;
  const cutBuckets = new Set(cuts.map((at) => Math.floor(at / track.stepS)));
  let total = 0;
  let counted = 0;
  for (let i = first; i <= last; i++) {
    if (cutBuckets.has(i)) continue;
    total += track.values[i] ?? 0;
    counted++;
  }
  return counted ? total / counted : 0;
}

export function focusWindow(scene: SourceWindow, playedS: number, cuts: number[] = [], motion?: MotionTrack | null) {
  const runs = uncutRuns(scene, cuts);
  const at = scene.sourceStartS + lengthOf(scene) * (scene.keyframeFraction ?? KEYFRAME_FRACTION);
  const roomy = runs.filter((run) => lengthOf(run) >= playedS - 1e-9);

  let room = scene;
  if (roomy.length) {
    room =
      roomy.find((run) => at >= run.sourceStartS && at <= run.sourceEndS) ??
      roomy.reduce((best, run) =>
        Math.abs(midpoint(run) - at) < Math.abs(midpoint(best) - at) ? run : best
      );
  }

  const roomS = lengthOf(room);
  if (playedS >= roomS) return { window: { ...room }, room };

  const target = Math.min(Math.max(at, room.sourceStartS), room.sourceEndS);
  const centred = Math.min(Math.max(target - playedS / 2, room.sourceStartS), room.sourceEndS - playedS);
  const start = motion ? liveliestStart(room, playedS, at, centred, motion, cuts) : centred;
  return { window: { sourceStartS: round3(start), sourceEndS: round3(start + playedS) }, room };
}

// Where inside the run to put the window. The described moment is still the
// anchor, but a scene can be 10s long with the action in the last third, and
// centring blindly lands on whatever was there — measured on a real export, the
// shots that read as frozen sat at a third of the opening's motion while the
// same uncut run had moving footage a second away.
//
// Candidates are every step of the motion track that fits inside the run, scored
// on mean motion relative to the run's own average, minus a penalty for drifting
// away from the described moment. Relative, not absolute: a quiet scene should
// still use its best second rather than being written off against a loud one.
function liveliestStart(
  room: SourceWindow,
  playedS: number,
  describedAtS: number,
  centred: number,
  motion: MotionTrack,
  cuts: number[]
) {
  const baseline = motionMean(motion, room.sourceStartS, room.sourceEndS, cuts);
  if (!(baseline > 0)) return centred;

  // Only matters on the fallback path, where `room` is a whole scene because no
  // uncut run was long enough. There the search can see cuts, and must not be
  // drawn onto one.
  const cutsInside = (from: number, to: number) =>
    cuts.filter((at) => at > from + 1e-6 && at < to - 1e-6).length;

  const latest = room.sourceEndS - playedS;
  const score = (start: number) =>
    movingFraction(motion, start, start + playedS, cuts) +
    MEAN_MOTION_WEIGHT * (motionMean(motion, start, start + playedS, cuts) / baseline) -
    MOTION_DRIFT_PENALTY * Math.abs(start + playedS / 2 - describedAtS) -
    CUT_PENALTY * cutsInside(start, start + playedS);

  let best = centred;
  let bestScore = score(centred);
  for (let start = room.sourceStartS; start <= latest + 1e-9; start += motion.stepS) {
    const candidate = Math.min(start, latest);
    const value = score(candidate);
    if (value > bestScore) {
      bestScore = value;
      best = candidate;
    }
  }
  return best;
}

// How many scenes a beat needs before any of its shots would exceed
// `maxShotS`. The beat borrows from unused scenes to reach it.
export function shotsNeededFor(targetS: number, pacing: MovieRecapPacing) {
  return Math.max(1, Math.ceil(targetS / pacing.maxShotS));
}

// The floor the invariant puts on a beat's cut count. Must never fight
// `minShotS` — see MOVIE_RECAP_PACING for the inequality every preset has to
// satisfy, and the test that enforces it.
export function minShotsFor(targetS: number, pacing: MovieRecapPacing) {
  return Math.max(1, Math.ceil(targetS / pacing.maxContinuousSourceS));
}

// Pick the spares this beat should borrow. Nearest in time to what it already
// has, so the borrowed footage still belongs to that stretch of the film — but
// a spare that BUTTS UP against a window the beat already holds is skipped
// while a non-touching one is available, because playing it next to its own
// neighbour produces exactly the unbroken run this module exists to prevent.
// The fastest speed any shot in this beat can be given. Speed is picked per
// shot index, so which one a scene ends up with is not known while scenes are
// being chosen — the fastest is the safe assumption, since it needs the most
// footage.

function motionOf(window: SourceWindow, motion?: MotionTrack | null) {
  return motion ? motionMean(motion, window.sourceStartS, window.sourceEndS) : 0;
}

function borrow(
  shots: SourceWindow[],
  spares: SourceWindow[],
  need: number,
  requiredS: number,
  motion?: MotionTrack | null,
  // Spare indexes an earlier call already took. Borrowing runs more than once
  // per beat — once for the cut count, then again for coverage — and the second
  // pass has to extend the first rather than re-pick the same windows.
  alreadyUsed: number[] = []
) {
  const picked = [...shots];
  const used: number[] = [...alreadyUsed];

  while (picked.length < need) {
    const remaining = spares
      .map((window, index) => ({ window, index }))
      .filter((candidate) => !used.includes(candidate.index));
    if (!remaining.length) break;

    const touches = (candidate: SourceWindow) =>
      picked.some(
        (held) =>
          Math.abs(candidate.sourceStartS - held.sourceEndS) <= CONTINUITY_EPSILON_S ||
          Math.abs(held.sourceStartS - candidate.sourceEndS) <= CONTINUITY_EPSILON_S
      );
    const apart = remaining.filter((candidate) => !touches(candidate.window));
    const pool = apart.length ? apart : remaining;

    // Nearest first, then the liveliest of those: a beat that has to borrow
    // should not spend its cut on a scene where nothing happens.
    const anchor = picked[picked.length - 1].sourceEndS;
    const nearest = [...pool]
      .sort((a, b) => Math.abs(a.window.sourceStartS - anchor) - Math.abs(b.window.sourceStartS - anchor))
      .slice(0, BORROW_CANDIDATES);
    // A scene shorter than the slot cannot fill it, and the render holds its
    // last frame for the difference. Prefer one that can, before motion decides.
    const fills = (window: SourceWindow) => (lengthOf(window) >= requiredS - 1e-9 ? 1 : 0);
    let best = nearest[0];
    for (const candidate of nearest) {
      const better =
        fills(candidate.window) - fills(best.window) ||
        (motionOf(candidate.window, motion) > motionOf(best.window, motion) ? 1 : -1);
      if (better > 0) best = candidate;
    }
    used.push(best.index);
    picked.push(best.window);
  }

  return { picked, used };
}

// Seconds this shot would spend on a HELD FRAME — footage the render has none
// of and fills by cloning. It mirrors the render's branches exactly, which is
// the point: borrowing another scene is only worth a cut if the alternative was
// actually a freeze.
//
// The render takes `slot * speed` seconds and plays them at `speed`, so a scene
// shorter than that window is padded by the difference.
export function holdDeficit(windowS: number, slotS: number) {
  const deficit = slotS - playedSourceSeconds(windowS, slotS) / MOVIE_RECAP_PLAYBACK_SPEED;
  return deficit > 1e-9 ? deficit : 0;
}

export type MovieRecapTimelineClip = SourceWindow & {
  slotS: number;
  padS: number;
  additional: boolean;
};

export type MovieRecapBeatTimeline = {
  clips: MovieRecapTimelineClip[];
  sparesUsed: number[];
  durationS: number;
  padS: number;
};

export function unusedSourceWindows(selected: SourceWindow[], durationS: number): SourceWindow[] {
  const merged: SourceWindow[] = [];
  for (const window of [...selected]
    .map((item) => ({
      sourceStartS: Math.max(0, Math.min(durationS, item.sourceStartS)),
      sourceEndS: Math.max(0, Math.min(durationS, item.sourceEndS)),
    }))
    .filter((item) => item.sourceEndS - item.sourceStartS >= MOVIE_RECAP_EDIT.minSourceS)
    .sort(byStart)) {
    const last = merged[merged.length - 1];
    if (last && window.sourceStartS <= last.sourceEndS + 1e-9) {
      last.sourceEndS = Math.max(last.sourceEndS, window.sourceEndS);
    } else {
      merged.push({ ...window });
    }
  }

  const unused: SourceWindow[] = [];
  let cursor = 0;
  for (const window of merged) {
    if (window.sourceStartS - cursor >= MOVIE_RECAP_EDIT.minSourceS) {
      unused.push({ sourceStartS: round3(cursor), sourceEndS: round3(window.sourceStartS) });
    }
    cursor = Math.max(cursor, window.sourceEndS);
  }
  if (durationS - cursor >= MOVIE_RECAP_EDIT.minSourceS) {
    unused.push({ sourceStartS: round3(cursor), sourceEndS: round3(durationS) });
  }
  return unused;
}

export function splitTimelineAcrossDurations(
  clips: MovieRecapTimelineClip[],
  durations: number[],
  playbackSpeed: number
): MovieRecapTimelineClip[][] {
  const perBeat: MovieRecapTimelineClip[][] = durations.map(() => []);
  let clipIndex = 0;
  let sourceConsumedS = 0;
  let slotConsumedS = 0;

  for (const [beatIndex, durationS] of durations.entries()) {
    let remaining = durationS;
    while (remaining > 1e-9 && clipIndex < clips.length) {
      const clip = clips[clipIndex];
      const clipRemainingS = clip.slotS - slotConsumedS;
      const slotS = Math.min(remaining, clipRemainingS);
      const movingS = Math.max(0, Math.min(slotS, lengthOf(clip) / playbackSpeed - slotConsumedS));
      const sourceStartS = clip.sourceStartS + sourceConsumedS;
      const sourceS = movingS * playbackSpeed;
      const renderStartS = sourceS >= MOVIE_RECAP_EDIT.minSourceS
        ? sourceStartS
        : Math.max(clip.sourceStartS, clip.sourceEndS - MOVIE_RECAP_EDIT.minSourceS);
      const renderEndS = sourceS >= MOVIE_RECAP_EDIT.minSourceS
        ? sourceStartS + sourceS
        : clip.sourceEndS;
      perBeat[beatIndex].push({
        sourceStartS: round3(renderStartS),
        sourceEndS: round3(renderEndS),
        slotS,
        padS: Math.max(0, slotS - movingS),
        additional: clip.additional,
      });
      remaining -= slotS;
      slotConsumedS += slotS;
      sourceConsumedS += sourceS;
      if (clipRemainingS - slotS <= 1e-9) {
        clipIndex++;
        sourceConsumedS = 0;
        slotConsumedS = 0;
      }
    }
  }
  return perBeat;
}

export type MovieRecapTimelineRates = {
  videoSpeed: number;
  narrationRate: number;
};

/**
 * Resolve one video speed and one narration rate for the whole recap.
 *
 * A beat may reclaim the one-second gaps inside its own selected footage before
 * this is needed. Every clip uses the same configured fixed video speed; it is
 * never tuned per beat or per project. When the full selected span is still
 * short at that speed, one narration rate is calculated from the recap's total
 * narration and total selected-footage durations. Every beat uses that same
 * rate. Adjacent footage remains a planner fallback, so an unrelated short beat
 * can never acquire its own private speed.
 */
export function resolveMovieRecapTimelineRates(
  beats: { shots: SourceWindow[]; targetS: number }[]
): MovieRecapTimelineRates {
  const usable = beats
    .map(({ shots, targetS }) => ({
      sourceS: shots.reduce((total, shot) => total + Math.max(0, lengthOf(shot)), 0),
      targetS: Math.max(1 / MOVIE_RECAP_TARGET_FPS, targetS),
    }))
    .filter(({ sourceS }) => sourceS >= MOVIE_RECAP_EDIT.minSourceS);
  if (!usable.length) {
    return { videoSpeed: MOVIE_RECAP_PLAYBACK_SPEED, narrationRate: MOVIE_RECAP_NARRATION_PLAYBACK_RATE };
  }

  const videoSpeed = MOVIE_RECAP_PLAYBACK_SPEED;
  const totalNarrationS = usable.reduce((total, beat) => total + beat.targetS, 0);
  const totalFootageS = usable.reduce((total, beat) => total + beat.sourceS / videoSpeed, 0);
  const rateNeeded = MOVIE_RECAP_NARRATION_PLAYBACK_RATE * (totalNarrationS / totalFootageS);
  const unclampedNarrationRate = Math.min(
    MOVIE_RECAP_NARRATION_MAX_PLAYBACK_RATE,
    Math.max(MOVIE_RECAP_NARRATION_PLAYBACK_RATE, rateNeeded)
  );
  const narrationRate = Math.ceil(unclampedNarrationRate * 1000) / 1000;
  return { videoSpeed, narrationRate };
}

function retainedWindows(windows: SourceWindow[], additional: boolean) {
  const kept: MovieRecapTimelineClip[] = [];
  const stride = MOVIE_RECAP_EDIT.retainSourceS + MOVIE_RECAP_EDIT.skipSourceS;
  for (const window of windows) {
    for (let start = window.sourceStartS; start < window.sourceEndS - 1e-9; start += stride) {
      const end = Math.min(window.sourceEndS, start + MOVIE_RECAP_EDIT.retainSourceS);
      if (end - start < MOVIE_RECAP_EDIT.minSourceS) continue;
      kept.push({ sourceStartS: round3(start), sourceEndS: round3(end), slotS: 0, padS: 0, additional });
    }
  }
  return kept;
}

export function retainedMovieRecapTimeline(
  windows: SourceWindow[],
  playbackSpeed: number = MOVIE_RECAP_PLAYBACK_SPEED,
  screenDurationS = Number.POSITIVE_INFINITY
): MovieRecapTimelineClip[] {
  const clips: MovieRecapTimelineClip[] = [];
  let remaining = screenDurationS;
  for (const clip of retainedWindows(windows, false)) {
    if (remaining <= 1e-9) break;
    const slotS = Math.min(lengthOf(clip) / playbackSpeed, remaining);
    clips.push({
      ...clip,
      sourceEndS: round3(clip.sourceStartS + slotS * playbackSpeed),
      slotS,
    });
    remaining -= slotS;
  }
  return clips;
}

function fullWindows(windows: SourceWindow[], additional: boolean) {
  return windows
    .filter((window) => lengthOf(window) >= MOVIE_RECAP_EDIT.minSourceS)
    .map((window) => ({ ...window, slotS: 0, padS: 0, additional }));
}

function distanceFromSelected(window: SourceWindow, selected: SourceWindow[]) {
  if (!selected.length) return window.sourceStartS;
  return Math.min(
    ...selected.map((shot) =>
      window.sourceEndS < shot.sourceStartS
        ? shot.sourceStartS - window.sourceEndS
        : window.sourceStartS > shot.sourceEndS
          ? window.sourceStartS - shot.sourceEndS
          : 0
    )
  );
}

/**
 * Build a picture timeline for the requested duration. Real renders call this
 * once for the whole narration; mocks may still use it for one beat. Selected
 * windows come first with the configured retain/skip cadence, then their skipped
 * seconds are reclaimed, then unused source is consumed. Only the final global
 * shortage is freeze-padded. Excess footage is trimmed to the exact duration.
 */
export function planMovieRecapBeatTimeline({
  shots,
  spares,
  targetS,
  playbackSpeed = MOVIE_RECAP_PLAYBACK_SPEED,
}: {
  shots: SourceWindow[];
  spares: SourceWindow[];
  targetS: number;
  playbackSpeed?: number;
}): MovieRecapBeatTimeline {
  const wanted = Math.max(1 / MOVIE_RECAP_TARGET_FPS, targetS);
  const retained = retainedWindows(shots, false);
  const retainedScreenS = retained.reduce((total, clip) => total + lengthOf(clip) / playbackSpeed, 0);
  // Reclaim the configured one-second gaps only when the normal 3-on/1-off cut
  // cannot cover this beat. Full windows preserve source order; appending the
  // skipped seconds later would make the scene jump backwards in time.
  const selected = retainedScreenS + 1e-9 >= wanted ? retained : fullWindows(shots, false);
  const rankedSpares = spares
    .map((window, index) => ({ window, index }))
    .sort((a, b) => distanceFromSelected(a.window, shots) - distanceFromSelected(b.window, shots));
  const candidates = [
    ...selected.map((clip) => ({ clip, spareIndex: null as number | null })),
    // Borrowing is the final source-footage fallback. Use the nearest adjacent
    // scene continuously and trim it to the exact deficit, avoiding a parade of
    // unrelated 3-second inserts when one nearby scene is sufficient.
    ...rankedSpares.flatMap(({ window, index }) =>
      fullWindows([window], true).map((clip) => ({ clip, spareIndex: index }))
    ),
  ];

  const clips: MovieRecapTimelineClip[] = [];
  const used = new Set<number>();
  let remaining = wanted;
  for (const { clip, spareIndex } of candidates) {
    if (remaining <= 1e-9) break;
    const sourceS = lengthOf(clip);
    const screenS = sourceS / playbackSpeed;
    const slotS = Math.min(remaining, screenS);
    const usedSourceS = slotS * playbackSpeed;
    clips.push({
      ...clip,
      sourceEndS: round3(clip.sourceStartS + usedSourceS),
      slotS,
      padS: 0,
    });
    if (spareIndex !== null) used.add(spareIndex);
    remaining -= slotS;
  }

  if (!clips.length) {
    const fallback = shots[0] ?? spares[0];
    if (!fallback) throw new Error("This narration beat has no footage to render.");
    const sourceEndS = Math.min(fallback.sourceEndS, fallback.sourceStartS + MOVIE_RECAP_EDIT.minSourceS);
    const availableS = Math.max(0, sourceEndS - fallback.sourceStartS) / playbackSpeed;
    clips.push({
      sourceStartS: fallback.sourceStartS,
      sourceEndS,
      slotS: wanted,
      padS: Math.max(0, wanted - availableS),
      additional: !shots.length,
    });
    if (!shots.length) used.add(0);
    remaining = 0;
  } else if (remaining > 1e-9) {
    const last = clips[clips.length - 1];
    last.slotS += remaining;
    last.padS += remaining;
    remaining = 0;
  }

  return {
    clips,
    sparesUsed: [...used],
    durationS: clips.reduce((sum, clip) => sum + clip.slotS, 0),
    padS: clips.reduce((sum, clip) => sum + clip.padS, 0),
  };
}

// Which of a beat's scenes survive when it cannot afford them all. Dropping the
// LAST ones chronologically — what `slice()` did — always cost the beat the end
// of its own line, which is usually its payoff. The deadest go instead, and the
// survivors stay in film order.
function keepLiveliest(
  windows: SourceWindow[],
  count: number,
  requiredS: number,
  motion?: MotionTrack | null
) {
  if (windows.length <= count) return [...windows];
  // Scenes too short to fill the slot go first whatever their motion: the render
  // pads the difference by holding a frame, and a held frame is worse than a
  // quiet one.
  const fills = (window: SourceWindow) => (lengthOf(window) >= requiredS - 1e-9 ? 1 : 0);
  return windows
    .map((window, index) => ({ window, index, motion: motionOf(window, motion) }))
    .sort((a, b) => fills(b.window) - fills(a.window) || b.motion - a.motion || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.window);
}

// Last resort, when the spare pool cannot supply enough distinct scenes: cut one
// scene into several non-contiguous windows. Each is different footage with a
// visible skip between them, so it reads as a jump cut rather than a hold — and
// unlike reusing a scene from elsewhere in the film, nothing is shown twice.
function subSplit(windows: SourceWindow[], targetS: number, minCount: number) {
  const slotS = targetS / minCount;
  const counts = windows.map(() => 1);
  // What is left over in a window after fitting `k` slots with a jump between
  // each. Negative means the window cannot carry that many.
  const spare = (window: SourceWindow, k: number) => lengthOf(window) - (k * slotS + (k - 1) * MIN_JUMP_S);

  let total = windows.length;
  while (total < minCount) {
    let best = -1;
    for (let i = 0; i < windows.length; i++) {
      if (spare(windows[i], counts[i] + 1) < 0) continue;
      if (best === -1 || spare(windows[i], counts[i] + 1) > spare(windows[best], counts[best] + 1)) best = i;
    }
    if (best === -1) break;
    counts[best]++;
    total++;
  }

  const out: SourceWindow[] = [];
  windows.forEach((window, i) => {
    const k = counts[i];
    if (k === 1) {
      out.push(window);
      return;
    }
    // Spread the k windows evenly across the scene: the first starts where the
    // scene does, the last ends where it does, and the skip between them is
    // whatever is left over divided up — at least MIN_JUMP_S, by the check above.
    const stride = (lengthOf(window) - slotS) / (k - 1);
    for (let j = 0; j < k; j++) {
      const start = window.sourceStartS + j * stride;
      out.push({ sourceStartS: round3(start), sourceEndS: round3(start + slotS) });
    }
  });

  return out.sort(byStart);
}

// A planned shot: the piece that will play, and the room it may slide within —
// the uncut run it was taken from, so sliding can never push it across one of
// the film's own cuts.
type Planned = { window: SourceWindow; room: SourceWindow };

// Walk the planned shots and pull apart any run of source that would play
// unbroken for longer than `pacing.maxContinuousSourceS`. Chronological order is
// preserved (see history/movie-recap.md, 2026-09-16): the fix is to move a
// window INSIDE its own scene, never to reorder the beat.
function breakContinuity(planned: Planned[], slotS: number, pacing: MovieRecapPacing) {
  const out = planned.map((shot) => ({ window: { ...shot.window }, room: shot.room }));
  let unresolved = 0;
  // Measured in SCREEN seconds, not source seconds. A scene shorter than its
  // slot is freeze-padded, so 1s of source can occupy 1.7s of the recap — and it
  // is the time a viewer spends looking at that footage which the limit is about.
  let runS = slotS;

  for (let i = 1; i < out.length; i++) {
    const previous = out[i - 1];
    const current = out[i];
    const gap = current.window.sourceStartS - previous.window.sourceEndS;

    if (Math.abs(gap) > CONTINUITY_EPSILON_S) {
      runS = slotS;
      continue;
    }

    runS += slotS;
    if (runS <= pacing.maxContinuousSourceS + 1e-9) continue;

    let needed = MIN_JUMP_S - gap;

    // Slide the current shot later inside its own scene. Preferred over every
    // other lever: it costs nothing, since the window is only a slot-sized view
    // of a longer scene.
    const slideLater = Math.min(needed, Math.max(0, current.room.sourceEndS - current.window.sourceEndS));
    if (slideLater > 0) {
      current.window.sourceStartS = round3(current.window.sourceStartS + slideLater);
      current.window.sourceEndS = round3(current.window.sourceEndS + slideLater);
      needed -= slideLater;
    }

    // Then slide the previous shot earlier inside its own scene.
    if (needed > 1e-9) {
      const slideEarlier = Math.min(needed, Math.max(0, previous.window.sourceStartS - previous.room.sourceStartS));
      if (slideEarlier > 0) {
        previous.window.sourceStartS = round3(previous.window.sourceStartS - slideEarlier);
        previous.window.sourceEndS = round3(previous.window.sourceEndS - slideEarlier);
        needed -= slideEarlier;
      }
    }

    // Last resort, when neither scene has room to slide: end the previous shot
    // early. It shows less source, so the render freeze-pads the remainder of
    // its slot — a held frame with a cut after it beats an unbroken run.
    if (needed > 1e-9) {
      const shrink = Math.min(needed, Math.max(0, lengthOf(previous.window) - MIN_WINDOW_S));
      if (shrink > 0) {
        previous.window.sourceEndS = round3(previous.window.sourceEndS - shrink);
        needed -= shrink;
      }
    }

    if (needed > 1e-9) unresolved++;
    else runS = slotS;
  }

  return { shots: out.map((shot) => shot.window), unresolved };
}

export type BeatPlan = {
  shots: SourceWindow[];
  slotS: number;
  shotCount: number;
  /** Indexes into the `spares` argument that this beat consumed. */
  sparesUsed: number[];
  /** Set when the invariant could not be met — never expected; worth a log line. */
  warning: string | null;
};

/**
 * Plan one narration beat.
 *
 * `targetS` is the beat's length, already decided by its measured narration
 * audio. The shots returned always add up to it exactly — the narration track is
 * padded to the same number, so any drift desynchronizes speech from picture.
 *
 * `cuts` is every cut detection found, including the ones merged away when the
 * scene list was built. Without it a shot can be planned across one of the
 * film's own edits and arrive as two.
 *
 * `pacing` is the aspect ratio's shot band and continuity limit — 9:16 cuts
 * fast, 16:9 holds longer. See MOVIE_RECAP_PACING.
 */
export function planBeat({
  shots,
  spares,
  targetS,
  pacing,
  cuts = [],
  motion,
}: {
  shots: SourceWindow[];
  spares: SourceWindow[];
  targetS: number;
  /** The aspect ratio's pacing profile; see MOVIE_RECAP_PACING. */
  pacing: MovieRecapPacing;
  /** Every cut detection found, so a shot is never planned across one. */
  cuts?: number[];
  /** Picture motion across the source, so a shot lands on its liveliest second. */
  motion?: MotionTrack | null;
}): BeatPlan {
  const minCount = minShotsFor(targetS, pacing);
  const affordable = Math.max(1, Math.floor(targetS / pacing.minShotS));
  const wanted = Math.max(1, Math.ceil(targetS / pacing.shotTargetS));
  const need = Math.max(Math.min(shotsNeededFor(targetS, pacing), affordable), minCount);

  // How much SOURCE a shot of this length needs, which is not its slot: the
  // render plays `slot * speed` seconds at MOVIE_RECAP_PLAYBACK_SPEED. Testing
  // against the slot alone let scenes through that were too short, and the
  // render held a frame for the difference.
  const footageFor = (slot: number) => slot * MOVIE_RECAP_PLAYBACK_SPEED;
  const first = borrow(shots, spares, need, footageFor(targetS / need), motion);
  let pool = first.picked;
  let used = first.used;
  // Cuts play in the order they happen in the film, borrowed or not.
  pool.sort(byStart);

  // `ceil`, not `round`: at 2s of speech rounding gives one 2s hold, which is
  // the dragging pace the cutting replaced. `minShotS` stops the bias from
  // producing flicker. Scenes the line is too short to pay for are dropped —
  // the model picks scenes before anything knows how long the line will run.
  let shotCount = Math.min(pool.length, wanted, affordable);
  shotCount = Math.max(shotCount, Math.min(minCount, pool.length));

  let scenes = keepLiveliest(pool, shotCount, footageFor(targetS / shotCount), motion);

  // COVERAGE. Everything above sizes the beat by its CUT COUNT; this asks
  // whether there is footage behind those cuts, which is a different question
  // and used not to be asked at all. A 2.2s scene under a 4s slot satisfies
  // minCount, maxShotS and minShotS alike at one shot, and reaches the render
  // 1.8s short — which the render answers with a held frame while the spare
  // pool sits there untouched.
  //
  // So: while the plan would still freeze, and the beat can afford another cut
  // without falling under `minShotS`, borrow another scene. Each extra shot
  // shrinks the slot AND adds footage, so the deficit falls from both ends.
  // This can push the count past `wanted` — deliberately. A cut the viewer did
  // not expect beats a picture that stops moving.
  //
  // Sub-splitting cannot serve this, and the arithmetic is why: splitting one
  // 2.2s scene into two windows halves the slot too, so the deficit is
  // identical either way. It adds cuts, never footage. It stays below, serving
  // the continuity invariant only.
  const deficitOf = (windows: SourceWindow[], count: number) => {
    const slot = targetS / count;
    return windows.reduce(
      (total, window) => total + holdDeficit(lengthOf(window), slot),
      0
    );
  };
  while (deficitOf(scenes, shotCount) > 1e-9 && shotCount < affordable) {
    const grown = borrow(pool, spares, shotCount + 1, footageFor(targetS / (shotCount + 1)), motion, used);
    // Nothing left to borrow — the render will have to hold a frame after all.
    if (grown.picked.length <= pool.length) break;
    pool = grown.picked.sort(byStart);
    used = grown.used;
    shotCount = Math.min(pool.length, affordable, shotCount + 1);
    scenes = keepLiveliest(pool, shotCount, footageFor(targetS / shotCount), motion);
  }

  let warning: string | null = null;

  if (shotCount < minCount) {
    scenes = subSplit(scenes, targetS, minCount);
    shotCount = scenes.length;
    if (shotCount < minCount) {
      warning =
        `cannot hold source under ${pacing.maxContinuousSourceS}s: ${targetS.toFixed(2)}s of narration needs ` +
        `${minCount} cuts and the beat has ${shotCount} window(s) of footage, too short to split further.`;
    }
  }

  const slotS = targetS / shotCount;
  // Narrow each scene to the piece that will actually play, centred on the frame
  // the vision pass described. Everything downstream — the continuity check here
  // and the four ffmpeg branches in the render — works on that piece, so a shot
  // shows the moment its line is about rather than whatever the scene opened on.
  const planned: Planned[] = scenes.map((scene) =>
    focusWindow(scene, playedSourceSeconds(lengthOf(scene), slotS), cuts, motion)
  );

  // Anything the render will have to hold a frame through. The coverage pass
  // above has already spent every cut it could afford on this, so what is left
  // is unfixable: a beat under `minShotS * 2` cannot be split, so a short scene
  // under a long line freezes and there is no cut to buy. Logged because a
  // silent version of it shipped once, as 1.3s of cloned frames per shot.
  //
  // A window shorter than its slot is NOT a gap: everything plays at
  // MOVIE_RECAP_PLAYBACK_SPEED, so `slot * speed` seconds of footage fill the
  // slot exactly. Measuring the raw difference made every healthy shot report
  // 5% of its slot as held frames.
  const padding = planned.reduce((total, shot) => total + holdDeficit(lengthOf(shot.window), slotS), 0);

  const broken = breakContinuity(planned, slotS, pacing);
  if (padding > 0.1 && !warning) {
    warning = `${padding.toFixed(2)}s of this beat has no footage behind it and will be held frames.`;
  }
  if (broken.unresolved && !warning) {
    warning =
      `${broken.unresolved} adjacent shot pair(s) could not be separated — that footage plays unbroken for ` +
      `${(slotS * 2).toFixed(2)}s against a ${pacing.maxContinuousSourceS}s limit.`;
  }

  return { shots: broken.shots, slotS, shotCount, sparesUsed: used, warning };
}
