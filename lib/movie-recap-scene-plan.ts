import {
  MOVIE_RECAP_MIN_PLAYBACK_SPEED,
  MOVIE_RECAP_PLAYBACK_SPEED,
  MOVIE_RECAP_TINY_FREEZE_S,
  MOVIE_RECAP_RIBBON_DRIFT_CAP_S,
  type MovieRecapPacing,
} from "./constants/movie-recap";
import type { SourceWindow } from "./movie-recap-shots";

// Cutting a hand-timed block on the film's OWN cuts, rather than on windows the
// planner invents inside it.
//
// This is the whole difference between this module and lib/movie-recap-shots.ts.
// That planner was built for a script whose beats name scenes it may borrow,
// reorder and narrow; it opens a gap between adjacent windows so the cut reads
// as a cut, and it pays for that gap with footage it then has to freeze back.
// Here the block's footage is fixed by the user's timestamps and the cuts are
// the film's own, so the jump is free: every second of the block plays, in
// order, and nothing is skipped or held. Measured on a real export, that gap is
// what produced 37 of 56 held seconds (history/movie-recap.md, 2026-09-19).
//
// Pure arithmetic on purpose — no ffmpeg, no model — so the invariant below is
// testable: the returned windows tile their input exactly.

// THE SHORTEST A BEAT MAY BE, and the control over how finely the story is
// divided — not over how often the picture cuts, which is
// `maxContinuousSourceS` and is applied under this by `splitSceneIntoShots`.
// Merging two of the film's cuts together makes a longer window, and that window
// is still cut every few seconds on screen.
//
// It is the knob that decides overruns. Measured on a real export: at 1s a 170s
// film cut 75 times became 60 beats averaging 2.8s, and a single Burmese
// sentence takes 3-8s to say — 27 of them overran, by 42s in total, while their
// neighbours sat 35s under. The whole narration was only 4% longer than the
// film, so none of that was the writing; all of it was granularity.
//
// Raised to 4 on that measurement and put back to 1 on the user's call the same
// day, before a render had been cut either way. The number above is what to
// reach for when overruns are spread across many short beats.
export const MIN_SCENE_S = 1;

// Most scenes a single hand-timed block may become.
//
// Not a picture limit — it costs the block nothing on screen, because merging
// two scenes only makes a longer window and `splitSceneIntoShots` still cuts it
// every few seconds. It is a limit on NARRATION UNITS, and therefore on spend: a
// scene is a keyframe, a share of a vision call, and a TTS call of its own, and
// a block whose passage is four sentences cannot use twenty of them — the extra
// scenes come back with no text and are merged into their neighbour anyway,
// after being paid for. Twelve is comfortably more than a block's passage can
// fill while keeping a fast-cut stretch of film from costing a call per cut.
export const MAX_SCENES_PER_BLOCK = 12;

const round3 = (value: number) => Number(value.toFixed(3));
const lengthOf = (window: SourceWindow) => window.sourceEndS - window.sourceStartS;

/**
 * The film's own scenes inside one hand-timed block.
 *
 * `cuts` is every cut detection in the source. Cuts landing within `minSceneS`
 * of the block's own edges are ignored: splitting there leaves a sliver that
 * would immediately be merged back. A block with more cuts than
 * MAX_SCENES_PER_BLOCK keeps its longest scenes and merges the rest away.
 *
 * A block SHORTER than `minSceneS` still comes back as one scene — the user's
 * timestamps decide what footage exists, and this only decides where to divide
 * it.
 */
export function scenesInBlock(
  startS: number,
  endS: number,
  cuts: number[],
  minSceneS = MIN_SCENE_S,
  maxScenes = MAX_SCENES_PER_BLOCK
): SourceWindow[] {
  if (!(endS > startS)) return [];
  const inside = cuts
    .filter((at) => at > startS + minSceneS && at < endS - minSceneS)
    .sort((a, b) => a - b);

  const bounds = [startS];
  for (const at of inside) {
    // Keeps the RUNNING scene above the floor, so a burst of quick cuts becomes
    // one scene instead of a chain of slivers.
    if (at - bounds[bounds.length - 1] >= minSceneS) bounds.push(at);
  }
  bounds.push(endS);

  const scenes: SourceWindow[] = [];
  for (let i = 1; i < bounds.length; i++) {
    scenes.push({ sourceStartS: round3(bounds[i - 1]), sourceEndS: round3(bounds[i]) });
  }
  // The last scene can still fall under the floor — the block's end is not a cut
  // and cannot be moved, so it joins the one before it.
  if (scenes.length > 1) {
    const last = scenes[scenes.length - 1];
    if (last.sourceEndS - last.sourceStartS < minSceneS) {
      scenes[scenes.length - 2].sourceEndS = last.sourceEndS;
      scenes.pop();
    }
  }

  // Shortest-first merging, so what disappears is the quick cutaway rather than
  // the scene that carries the block. Always into the SHORTER neighbour, which
  // keeps the block's scenes near each other in length instead of growing one
  // long one at the front.
  while (scenes.length > maxScenes) {
    let shortest = 0;
    for (let i = 1; i < scenes.length; i++) {
      if (lengthOf(scenes[i]) < lengthOf(scenes[shortest])) shortest = i;
    }
    const before = shortest > 0 ? scenes[shortest - 1] : null;
    const after = shortest + 1 < scenes.length ? scenes[shortest + 1] : null;
    const mergeBack = !after || (before !== null && lengthOf(before) <= lengthOf(after));
    if (mergeBack && before) {
      before.sourceEndS = scenes[shortest].sourceEndS;
    } else if (after) {
      after.sourceStartS = scenes[shortest].sourceStartS;
    } else {
      break;
    }
    scenes.splice(shortest, 1);
  }
  return scenes;
}
// An even division of one unbroken run. Used inside `splitSceneIntoShots` for a
// run with no usable edit left in it.
function divideEvenly(window: SourceWindow, pacing: MovieRecapPacing): SourceWindow[] {
  const lengthS = window.sourceEndS - window.sourceStartS;
  if (lengthS <= 0) return [];
  const wanted = Math.max(1, Math.ceil(lengthS / pacing.maxContinuousSourceS));
  const affordable = Math.max(1, Math.floor(lengthS / pacing.minShotS));
  const count = Math.min(wanted, affordable);
  if (count <= 1) return [{ ...window }];

  const piece = lengthS / count;
  const shots: SourceWindow[] = [];
  for (let i = 0; i < count; i++) {
    const start = window.sourceStartS + i * piece;
    // The last piece takes the window's own end, so rounding cannot leave a gap
    // or overshoot the block.
    shots.push({
      sourceStartS: round3(start),
      sourceEndS: i === count - 1 ? round3(window.sourceEndS) : round3(start + piece),
    });
  }
  return shots;
}
/**
 * One beat's window cut into the shots that will play it, back to back.
 *
 * `cuts` is the film's own edits, and giving them is what keeps a SHOT from
 * containing one. A beat's window spans several real scenes whenever short ones
 * were merged to reach MIN_SCENE_S, so dividing it evenly would sooner or later
 * lay a shot across an edit: the segment looks like one shot to the pipeline and
 * changes picture halfway through to the viewer. Splitting on the edits first
 * means every shot is a piece of ONE scene.
 *
 * Runs shorter than `minShotS` are absorbed into the next one rather than
 * becoming flashes — that run then does contain an edit, which is the lesser of
 * the two problems and is what the floor is for.
 *
 * `maxContinuousSourceS` then applies inside each run: a long unbroken take is
 * still divided, the way a real edit cuts within a shot, and no footage is
 * dropped between the pieces.
 */
export function splitSceneIntoShots(scene: SourceWindow, pacing: MovieRecapPacing, cuts: number[] = []): SourceWindow[] {
  const lengthS = scene.sourceEndS - scene.sourceStartS;
  if (lengthS <= 0) return [];

  const inside = cuts
    .filter((at) => at > scene.sourceStartS + 1e-6 && at < scene.sourceEndS - 1e-6)
    .sort((a, b) => a - b);
  if (!inside.length) return divideEvenly(scene, pacing);

  const bounds = [scene.sourceStartS];
  for (const at of inside) {
    if (at - bounds[bounds.length - 1] >= pacing.minShotS) bounds.push(at);
  }
  bounds.push(scene.sourceEndS);
  // The tail can still fall under the floor — the window's end is not an edit
  // and cannot move, so it joins the run before it.
  if (bounds.length > 2 && bounds[bounds.length - 1] - bounds[bounds.length - 2] < pacing.minShotS) {
    bounds.splice(bounds.length - 2, 1);
  }

  const shots: SourceWindow[] = [];
  for (let i = 1; i < bounds.length; i++) {
    shots.push(...divideEvenly({ sourceStartS: round3(bounds[i - 1]), sourceEndS: round3(bounds[i]) }, pacing));
  }
  return shots;
}

/**
 * The longest unbroken stretch inside a beat's window.
 *
 * Where its keyframe is taken from, and not a detail: a beat that merged short
 * cuts together spans several real pictures, and a frame a third of the way into
 * the MERGED window can land on a two-second cutaway while the scene the beat is
 * actually about fills the rest. The vision pass then describes the cutaway, and
 * the split pass matches the user's sentence to it.
 *
 * The longest run is the picture the beat mostly IS. Falls back to the whole
 * window when there are no edits inside it.
 */
export function dominantRun(window: SourceWindow, cuts: number[]): SourceWindow {
  const bounds = [
    window.sourceStartS,
    ...cuts.filter((at) => at > window.sourceStartS + 1e-6 && at < window.sourceEndS - 1e-6).sort((a, b) => a - b),
    window.sourceEndS,
  ];
  let best = window;
  let bestLength = 0;
  for (let i = 1; i < bounds.length; i++) {
    const length = bounds[i] - bounds[i - 1];
    if (length > bestLength) {
      bestLength = length;
      best = { sourceStartS: round3(bounds[i - 1]), sourceEndS: round3(bounds[i]) };
    }
  }
  return best;
}

/**
 * Lay a block's narration over its footage as one continuous ribbon.
 *
 * The beats decide WHICH WORDS play in what order; this decides how much
 * footage each of them gets, and it ignores which scene a beat was originally
 * matched to. A beat whose line runs long takes footage from the one after it;
 * a short line hands footage back. Inside a block that costs nothing — the
 * pieces play in order and touch, so there is no jump anywhere — and it is why
 * a block whose narration fits overall no longer freezes just because the words
 * fell unevenly across its scenes. Measured on a real export: 113s of beat-level
 * overrun against 13s of real block-level deficit.
 *
 * The block's own start and end never move. Borrowing across them would take
 * footage the user assigned to different words, and their timestamps are the one
 * thing in the pipeline that is not negotiable.
 *
 * Returns one window per beat plus whatever the block could not cover, which the
 * render holds as a frame on the last beat.
 */
/** The nearest cut inside [low, high], or `at` when there is none. */
function snapToCut(at: number, cuts: number[], low: number, high: number) {
  let best = at;
  let distance = Infinity;
  for (const cut of cuts) {
    if (cut < low || cut > high) continue;
    const gap = Math.abs(cut - at);
    if (gap < distance) {
      distance = gap;
      best = cut;
    }
  }
  return best;
}

export function layoutBlockRibbon({
  blockStartS,
  blockEndS,
  audioS,
  anchorS,
  cuts = [],
}: {
  blockStartS: number;
  blockEndS: number;
  /** Measured narration length of each beat in the block, in order. */
  audioS: number[];
  /**
   * The timestamp each beat's words were written against, in order. Beats from
   * the same timestamped block share one, and the boundary between two of those
   * is left free — there is no stamp between them to be near.
   */
  anchorS?: number[];
  /**
   * The film's own cuts. A boundary that can reach one without breaking the
   * drift cap takes it, so the picture changes where the film already changed
   * it rather than in the middle of a take. Free: the boundary was allowed to
   * move that far anyway, and no footage is gained or lost by moving it.
   */
  cuts?: number[];
}): { windows: SourceWindow[]; shortfallS: number } {
  const windows: SourceWindow[] = [];
  // Screen seconds, not source seconds: the block plays at
  // MOVIE_RECAP_PLAYBACK_SPEED, so its footage covers more narration than its
  // own length. A beat wanting N seconds of speech therefore owns N * speed
  // seconds of source.
  const footageS = Math.max(0, blockEndS - blockStartS);
  const screenS = footageS / MOVIE_RECAP_PLAYBACK_SPEED;
  const wantedS = audioS.reduce((total, value) => total + value, 0);
  // Over-subscribed: every beat gives up the same fraction, so the shortfall is
  // shared rather than dumped on whichever beat happens to be last. The render
  // holds a frame for each beat's share.
  const scale = wantedS > screenS && wantedS > 0 ? screenS / wantedS : 1;

  let cursor = blockStartS;
  for (const [index, seconds] of audioS.entries()) {
    const last = index === audioS.length - 1;
    const ideal = last ? blockEndS : Math.min(blockEndS, cursor + seconds * scale * MOVIE_RECAP_PLAYBACK_SPEED);
    // The NEXT beat's stamp is what this boundary is measured against, and only
    // when the next beat is a different block — two beats split out of one block
    // have no stamp between them.
    const next = anchorS?.[index + 1];
    const free = last || next === undefined || next === anchorS?.[index];
    const lowest = free ? cursor : Math.max(cursor, next! - MOVIE_RECAP_RIBBON_DRIFT_CAP_S);
    const highest = free ? blockEndS : Math.min(blockEndS, next! + MOVIE_RECAP_RIBBON_DRIFT_CAP_S);
    const bounded = last ? ideal : Math.min(Math.max(ideal, lowest), Math.max(lowest, highest));
    const end = last ? ideal : snapToCut(bounded, cuts, lowest, highest);
    windows.push({ sourceStartS: round3(cursor), sourceEndS: round3(Math.max(cursor, end)) });
    cursor = Math.max(cursor, end);
  }
  return { windows, shortfallS: Number(Math.max(0, wantedS - screenS).toFixed(3)) };
}

import type { MovieRecapNarrationSegment } from "./api/types";
import { MOVIE_RECAP_TARGET_FPS } from "./constants/movie-recap";
import { retainedMovieRecapTimeline, type MovieRecapTimelineClip } from "./movie-recap-shots";
import { estimateSpokenSeconds } from "./movie-recap-speech";

export type MovieRecapScenePlanGroup = {
  index: number;
  firstBeatIndex: number;
  beatIndices: number[];
  sourceStartS: number;
  sourceEndS: number;
  narrationS: number;
  targetS: number;
  footageS: number;
  trimS: number;
  freezeS: number;
  videoSpeed: number;
  clips: MovieRecapTimelineClip[];
};

export type MovieRecapSceneTimingPlan = {
  videoSpeed: number;
  narrationS: number;
  finalS: number;
  groups: MovieRecapScenePlanGroup[];
};

type SceneGroup = Omit<MovieRecapScenePlanGroup, "index" | "footageS" | "trimS" | "freezeS" | "videoSpeed">;

export function buildMovieRecapSceneTimingPlan({
  narration,
  videoSpeed = MOVIE_RECAP_PLAYBACK_SPEED,
  targetFps = MOVIE_RECAP_TARGET_FPS,
}: {
  narration: MovieRecapNarrationSegment[];
  videoSpeed?: number;
  targetFps?: number;
}): MovieRecapSceneTimingPlan {
  const groups: SceneGroup[] = narration.map((segment, beatIndex) => {
    const sourceStartS = segment.blockStartS ?? segment.shots[0]?.sourceStartS ?? 0;
    const sourceEndS = segment.blockEndS ?? segment.shots[segment.shots.length - 1]?.sourceEndS ?? sourceStartS;
    return {
      firstBeatIndex: beatIndex,
      beatIndices: [beatIndex],
      sourceStartS,
      sourceEndS,
      narrationS: segment.audioS ?? estimateSpokenSeconds(segment.text),
      targetS: 0,
      clips: retainedMovieRecapTimeline(
        [{ sourceStartS, sourceEndS }],
        videoSpeed
      ),
    };
  });

  let cursorS = 0;
  const planned = groups.map((group, index) => {
    const endS = Math.round((cursorS + group.narrationS) * targetFps) / targetFps;
    group.targetS = Math.max(1 / targetFps, endS - cursorS);
    cursorS = endS;
    const sourceS = group.clips.reduce((total, clip) => total + (clip.sourceEndS - clip.sourceStartS), 0);
    const baselineVideoS = sourceS / videoSpeed;
    const gapS = group.targetS - baselineVideoS;
    const requiredSpeed = sourceS > 0 ? sourceS / group.targetS : 0;
    const selectedSpeed =
      gapS > MOVIE_RECAP_TINY_FREEZE_S && requiredSpeed >= MOVIE_RECAP_MIN_PLAYBACK_SPEED
        ? requiredSpeed
        : gapS > MOVIE_RECAP_TINY_FREEZE_S
          ? MOVIE_RECAP_MIN_PLAYBACK_SPEED
          : videoSpeed;
    if (selectedSpeed !== videoSpeed) {
      group.clips = retainedMovieRecapTimeline(
        [{ sourceStartS: group.sourceStartS, sourceEndS: group.sourceEndS }],
        selectedSpeed
      );
    }
    const footageS = group.clips.reduce((total, clip) => total + clip.slotS, 0);
    return {
      ...group,
      index,
      footageS,
      trimS: Math.max(0, footageS - group.targetS),
      freezeS: Math.max(0, group.targetS - footageS),
      videoSpeed: selectedSpeed,
    } satisfies MovieRecapScenePlanGroup;
  });

  return {
    videoSpeed,
    narrationS: planned.reduce((total, group) => total + group.narrationS, 0),
    finalS: planned.reduce((total, group) => total + group.targetS, 0),
    groups: planned,
  };
}
