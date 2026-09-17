// Shot planning for a narration beat: how many cuts it gets, which piece of the
// source each one plays, and the one rule none of it may break —
// MAX_CONTINUOUS_SOURCE_S.
//
// It lives apart from the render because it is pure arithmetic that decides
// every cut in the video, and because the invariant below is only checkable in
// a test if nothing around it needs ffmpeg.

export type SourceWindow = { sourceStartS: number; sourceEndS: number };
/** Per-bucket picture motion across the source; see lib/movie-recap-scenes.ts. */
export type MotionTrack = { stepS: number; values: number[] };

// A beat is cut into shots rather than holding one clip for its whole length —
// real recaps cut every second or two under a continuous line, and a single
// held shot is what made the pacing drag.
//
// The pair below puts nearly every shot in a 1.5-2.5s band. They were 1.4 and
// 1.0, which the `ceil` bias pushed onto the floor: a measured export ran 20
// shots in 19.7s, mean 0.98s, and an action or a line of dialogue does not land
// in one second.
export const SHOT_TARGET_S = 2;
export const MIN_SHOT_S = 1.5;
// The planning target for borrowing: a beat pulls unused scenes until it can be
// cut without exceeding this. It is a target, not a guarantee.
export const MAX_SHOT_S = 2.4;

// THE HARD ONE. No source footage may be on screen for longer than this without
// a cut, whatever the beat's length and however few scenes it was given. It
// bounds a run of shots, not just one shot: two scenes that are adjacent in the
// source and played back to back are one unbroken run of footage, however many
// "cuts" the plan thinks it made.
export const MAX_CONTINUOUS_SOURCE_S = 3;
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

// Hybrid duration match: within this ratio band the render speed-ramps the
// segment to fit its slot, which means it plays the scene WHOLE. Outside it the
// scene is trimmed (or freeze-padded). The planner has to know which, because
// "how much source does this shot actually show" is what continuity is measured
// on — so the band lives here and the render imports it.
export const SPEED_RAMP_MIN = 0.85;
export const SPEED_RAMP_MAX = 1.15;

const round3 = (value: number) => Number(value.toFixed(3));
const lengthOf = (window: SourceWindow) => window.sourceEndS - window.sourceStartS;
const byStart = (a: SourceWindow, b: SourceWindow) => a.sourceStartS - b.sourceStartS;
const midpoint = (window: SourceWindow) => (window.sourceStartS + window.sourceEndS) / 2;

// How many seconds of SOURCE a shot shows, which is not its slot: a trimmed
// shot shows less than its scene, a freeze-padded one shows all of it and then
// holds, and a speed-ramped one shows all of it faster. Mirrors the four
// branches in the render's segment loop — change one and change both.
export function playedSourceSeconds(windowS: number, slotS: number, speed: number | null) {
  if (speed !== null) return Math.min(slotS * speed, windowS);
  if (slotS >= windowS) return windowS;
  return slotS / windowS >= SPEED_RAMP_MIN ? windowS : slotS;
}

// Where a scene's representative frame is taken: a third of the way in
// (lib/movie-recap-scenes.ts). That frame is what the vision pass described and
// therefore what the narration model picked the scene FOR, so it is the moment a
// shot has to contain. Keep the two in step.
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
  const at = scene.sourceStartS + lengthOf(scene) * KEYFRAME_FRACTION;
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

// How many scenes a beat needs before any of its shots would exceed MAX_SHOT_S.
// The beat borrows from unused scenes to reach it.
export function shotsNeededFor(targetS: number) {
  return Math.max(1, Math.ceil(targetS / MAX_SHOT_S));
}

// The floor the invariant puts on a beat's cut count. Never fights MIN_SHOT_S:
// floor(t / 1) >= ceil(t / 3) for every t >= 1, and a beat is at least 1s.
export function minShotsFor(targetS: number) {
  return Math.max(1, Math.ceil(targetS / MAX_CONTINUOUS_SOURCE_S));
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
function topSpeed(speedFor: ((shotIndex: number) => number) | undefined, count: number) {
  if (!speedFor) return 1;
  let top = 1;
  for (let i = 0; i < count; i++) top = Math.max(top, speedFor(i));
  return top;
}

function motionOf(window: SourceWindow, motion?: MotionTrack | null) {
  return motion ? motionMean(motion, window.sourceStartS, window.sourceEndS) : 0;
}

function borrow(
  shots: SourceWindow[],
  spares: SourceWindow[],
  need: number,
  requiredS: number,
  motion?: MotionTrack | null
) {
  const picked = [...shots];
  const used: number[] = [];

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
// unbroken for longer than MAX_CONTINUOUS_SOURCE_S. Chronological order is
// preserved (see history/movie-recap.md, 2026-09-16): the fix is to move a
// window INSIDE its own scene, never to reorder the beat.
function breakContinuity(planned: Planned[], slotS: number) {
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
    if (runS <= MAX_CONTINUOUS_SOURCE_S + 1e-9) continue;

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
 * `speedFor` is the copyright-free transform's per-shot speed, or undefined when
 * the transform is off. It is needed here because a sped-up shot consumes more
 * source than its slot, which changes where the next shot has to start.
 *
 * `cuts` is every cut detection found, including the ones merged away when the
 * scene list was built. Without it a shot can be planned across one of the
 * film's own edits and arrive as two.
 */
export function planBeat({
  shots,
  spares,
  targetS,
  speedFor,
  cuts = [],
  motion,
}: {
  shots: SourceWindow[];
  spares: SourceWindow[];
  targetS: number;
  speedFor?: (shotIndex: number) => number;
  /** Every cut detection found, so a shot is never planned across one. */
  cuts?: number[];
  /** Picture motion across the source, so a shot lands on its liveliest second. */
  motion?: MotionTrack | null;
}): BeatPlan {
  const minCount = minShotsFor(targetS);
  const affordable = Math.max(1, Math.floor(targetS / MIN_SHOT_S));
  const wanted = Math.max(1, Math.ceil(targetS / SHOT_TARGET_S));
  const need = Math.max(Math.min(shotsNeededFor(targetS), affordable), minCount);

  // How much SOURCE a shot of this length needs, which is not its slot: the
  // copyright-free transform plays `slot * speed` seconds, so at 1.07x a 2.9s
  // slot wants 3.1s of footage. Testing against the slot alone let scenes
  // through that were 4-7% too short, and the render held a frame for the
  // difference. The fastest speed is used, so the test never under-provisions.
  const footageFor = (slot: number) => slot * topSpeed(speedFor, Math.max(need, 1));
  const { picked, used } = borrow(shots, spares, need, footageFor(targetS / need), motion);
  // Cuts play in the order they happen in the film, borrowed or not.
  picked.sort(byStart);

  // `ceil`, not `round`: at 2s of speech rounding gives one 2s hold, which is
  // the dragging pace the cutting replaced. MIN_SHOT_S stops the bias from
  // producing flicker. Scenes the line is too short to pay for are dropped —
  // the model picks scenes before anything knows how long the line will run.
  let shotCount = Math.min(picked.length, wanted, affordable);
  shotCount = Math.max(shotCount, Math.min(minCount, picked.length));

  let scenes = keepLiveliest(picked, shotCount, footageFor(targetS / shotCount), motion);
  let warning: string | null = null;

  if (shotCount < minCount) {
    scenes = subSplit(scenes, targetS, minCount);
    shotCount = scenes.length;
    if (shotCount < minCount) {
      warning =
        `cannot hold source under ${MAX_CONTINUOUS_SOURCE_S}s: ${targetS.toFixed(2)}s of narration needs ` +
        `${minCount} cuts and the beat has ${shotCount} window(s) of footage, too short to split further.`;
    }
  }

  const slotS = targetS / shotCount;
  // Narrow each scene to the piece that will actually play, centred on the frame
  // the vision pass described. Everything downstream — the continuity check here
  // and the four ffmpeg branches in the render — works on that piece, so a shot
  // shows the moment its line is about rather than whatever the scene opened on.
  const planned: Planned[] = scenes.map((scene, index) =>
    focusWindow(
      scene,
      playedSourceSeconds(lengthOf(scene), slotS, speedFor ? speedFor(index) : null),
      cuts,
      motion
    )
  );

  // Anything the render will have to hold a frame through. Scenes are at least
  // MIN_SCENE_S and slots at most MAX_CONTINUOUS_SOURCE_S, so this should be
  // small or zero — it is logged because a silent version of it was shipped
  // once, as 1.3s of cloned frames at the end of most shots.
  const padding = planned.reduce((total, shot) => total + Math.max(0, slotS - lengthOf(shot.window)), 0);

  const broken = breakContinuity(planned, slotS);
  if (padding > 0.1 && !warning) {
    warning = `${padding.toFixed(2)}s of this beat has no footage behind it and will be held frames.`;
  }
  if (broken.unresolved && !warning) {
    warning =
      `${broken.unresolved} adjacent shot pair(s) could not be separated — that footage plays unbroken for ` +
      `${(slotS * 2).toFixed(2)}s against a ${MAX_CONTINUOUS_SOURCE_S}s limit.`;
  }

  return { shots: broken.shots, slotS, shotCount, sparesUsed: used, warning };
}
