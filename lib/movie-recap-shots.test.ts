import { describe, expect, it } from "vitest";
import { segmentFilters } from "./movie-recap-render";
import {
  focusWindow,
  motionMean,
  type MotionTrack,
  MAX_CONTINUOUS_SOURCE_S,
  MIN_JUMP_S,
  planBeat,
  playedSourceSeconds,
  shotsNeededFor,
  type SourceWindow,
} from "./movie-recap-shots";

// Scenes are at least MIN_SCENE_S (2s) apart in the real pipeline; these are
// spaced further so a window is only ever adjacent to another on purpose.
const scenes = (n: number, { lengthS = 2, gapS = 10, fromS = 0 } = {}): SourceWindow[] =>
  Array.from({ length: n }, (_, i) => ({
    sourceStartS: fromS + i * (lengthS + gapS),
    sourceEndS: fromS + i * (lengthS + gapS) + lengthS,
  }));

// The rule the whole module exists for: nothing from the source may be on
// screen for longer than MAX_CONTINUOUS_SOURCE_S without a cut. A run is broken
// only when the next shot starts somewhere OTHER than where the previous one
// stopped playing.
const longestContinuousRun = (
  shots: SourceWindow[],
  slotS: number,
  speedFor?: (shotIndex: number) => number
) => {
  let longest = slotS;
  let run = slotS;
  for (let i = 1; i < shots.length; i++) {
    const previous = shots[i - 1];
    const playedEnd =
      previous.sourceStartS +
      playedSourceSeconds(previous.sourceEndS - previous.sourceStartS, slotS, speedFor ? speedFor(i - 1) : null);
    run = Math.abs(shots[i].sourceStartS - playedEnd) <= 0.16 ? run + slotS : slotS;
    longest = Math.max(longest, run);
  }
  return longest;
};

describe("planBeat", () => {
  it("cuts roughly every 2s", () => {
    const plan = planBeat({ shots: scenes(4), spares: [], targetS: 6 });
    expect(plan.shotCount).toBe(3);
    expect(plan.slotS).toBeCloseTo(2, 6);
  });

  it("keeps a shot long enough for the action to land", () => {
    // The pacing complaint this band exists for: a measured export ran 20 shots
    // in 19.7s at a mean of 0.98s. Every beat length should now sit in 1.5-2.5s.
    for (const targetS of [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 9]) {
      const plan = planBeat({ shots: scenes(8), spares: [], targetS });
      expect(plan.slotS, `target=${targetS}`).toBeGreaterThanOrEqual(1.5 - 1e-9);
      expect(plan.slotS, `target=${targetS}`).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });

  it("rounds toward more cuts, not fewer", () => {
    // 3s is 1.5 shots at the target length; ceiling gives two 1.5s cuts rather
    // than one 3s hold, which is the pacing the cutting replaced.
    expect(planBeat({ shots: scenes(4), spares: [], targetS: 3 }).shotCount).toBe(2);
    expect(planBeat({ shots: scenes(5), spares: [], targetS: 5 }).shotCount).toBe(3);
  });

  it("never exceeds the hard cap, whatever the beat is given", () => {
    // MAX_SHOT_S (2.4) is the borrowing target; MIN_SHOT_S can hold the count
    // below what it asks for, so the cap that actually binds is this one.
    for (const targetS of [2.5, 3.2, 4.8, 7, 9.6]) {
      const plan = planBeat({ shots: scenes(shotsNeededFor(targetS)), spares: [], targetS });
      expect(plan.slotS).toBeLessThanOrEqual(MAX_CONTINUOUS_SOURCE_S + 1e-9);
    }
  });

  it("drops scenes the line is too short to pay for", () => {
    // 3s of speech cannot carry four scenes without each falling under the 1.5s
    // floor, so it keeps two and gives them 1.5s each.
    const plan = planBeat({ shots: scenes(4), spares: [], targetS: 3 });
    expect(plan.shotCount).toBe(2);
    expect(plan.slotS).toBe(1.5);
  });

  it("never returns a shot under the floor", () => {
    // The floor is why sub-second cuts in a rendered video come from cuts inside
    // the SOURCE footage, not from this planner. A beat shorter than the floor
    // is the one exception — it gets one shot of its own length.
    for (const targetS of [1, 1.4, 2.2, 3.7, 5.1, 9]) {
      for (const count of [1, 2, 3, 4]) {
        const plan = planBeat({ shots: scenes(count), spares: [], targetS });
        expect(plan.slotS).toBeGreaterThanOrEqual(Math.min(targetS, 1.5) - 1e-9);
      }
    }
  });

  it("always fills the beat exactly", () => {
    // The shots have to add up to the beat, or the narration track and the
    // picture drift apart.
    for (const targetS of [1.2, 3, 4.4, 6.8]) {
      const plan = planBeat({ shots: scenes(4), spares: [], targetS });
      expect(plan.slotS * plan.shotCount).toBeCloseTo(targetS, 6);
    }
  });

  it("borrows the nearest spare, and reports which", () => {
    const plan = planBeat({
      shots: [{ sourceStartS: 100, sourceEndS: 102 }],
      spares: [
        { sourceStartS: 400, sourceEndS: 402 },
        { sourceStartS: 130, sourceEndS: 132 },
      ],
      targetS: 4,
    });
    expect(plan.sparesUsed).toEqual([1]);
    expect(plan.shots.some((shot) => shot.sourceStartS === 130)).toBe(true);
  });

  it("skips a spare that butts up against footage the beat already holds", () => {
    // 102 starts exactly where the beat's own scene ends, so playing it next
    // would show one unbroken 4s run of source. The further spare is taken
    // instead, even though the adjacent one is nearer.
    const plan = planBeat({
      shots: [{ sourceStartS: 100, sourceEndS: 102 }],
      spares: [
        { sourceStartS: 102, sourceEndS: 104 },
        { sourceStartS: 300, sourceEndS: 302 },
      ],
      targetS: 4,
    });
    expect(plan.sparesUsed).toEqual([1]);
  });

  it("separates an adjacent pair the model itself grouped, keeping film order", () => {
    // Nothing to borrow, and the two scenes the model chose are contiguous in
    // the source. The planner moves a window inside its own scene rather than
    // reordering the beat.
    const plan = planBeat({
      shots: [
        { sourceStartS: 100, sourceEndS: 102 },
        { sourceStartS: 102, sourceEndS: 104 },
      ],
      spares: [],
      targetS: 4,
    });
    expect(plan.shotCount).toBe(2);
    expect(plan.shots[0].sourceStartS).toBeLessThan(plan.shots[1].sourceStartS);
    // The gap was opened inside the first scene, not by swapping the two.
    expect(plan.shots[0].sourceStartS).toBe(100);
    expect(plan.shots[1].sourceStartS - plan.shots[0].sourceEndS).toBeGreaterThanOrEqual(MIN_JUMP_S - 1e-9);
    expect(longestContinuousRun(plan.shots, plan.slotS)).toBeLessThanOrEqual(MAX_CONTINUOUS_SOURCE_S + 1e-9);
    expect(plan.warning).toBeNull();
  });

  it("sub-splits one scene rather than holding it, when there is nothing to borrow", () => {
    // Replaces the old behaviour, where an empty spare pool meant a 6s hold.
    const plan = planBeat({ shots: [{ sourceStartS: 10, sourceEndS: 26 }], spares: [], targetS: 6 });
    expect(plan.shotCount).toBeGreaterThanOrEqual(2);
    expect(plan.slotS).toBeLessThanOrEqual(MAX_CONTINUOUS_SOURCE_S + 1e-9);
    // Non-contiguous windows: a visible skip, not a hold.
    for (let i = 1; i < plan.shots.length; i++) {
      expect(plan.shots[i].sourceStartS - plan.shots[i - 1].sourceEndS).toBeGreaterThanOrEqual(MIN_JUMP_S - 1e-9);
    }
    expect(plan.warning).toBeNull();
  });

  it("warns instead of pretending, when the beat has no footage to split", () => {
    // A single 2s scene cannot carry 9s of narration under the cap by any
    // arrangement. It must say so rather than silently holding.
    const plan = planBeat({ shots: [{ sourceStartS: 10, sourceEndS: 12 }], spares: [], targetS: 9 });
    expect(plan.warning).toContain("cannot hold source under 3s");
  });

  it("separates three contiguous scenes in a row", () => {
    const plan = planBeat({
      shots: [
        { sourceStartS: 100, sourceEndS: 102 },
        { sourceStartS: 102, sourceEndS: 104 },
        { sourceStartS: 104, sourceEndS: 106 },
      ],
      spares: [],
      targetS: 6,
    });
    expect(longestContinuousRun(plan.shots, plan.slotS)).toBeLessThanOrEqual(MAX_CONTINUOUS_SOURCE_S + 1e-9);
  });

  it("holds nothing past 3s, across supply, beat length and scene length", () => {
    for (const targetS of [1, 2, 2.6, 3, 3.4, 4.2, 5.5, 7, 9]) {
      for (const count of [1, 2, 3, 4, 6]) {
        for (const lengthS of [1, 2, 4, 12]) {
          for (const spareCount of [0, 1, 4]) {
            // gapS 0 is the case a per-shot cap cannot see: every scene butts
            // up against the next, so the beat's own grouping and anything it
            // borrows are all candidates for one unbroken run.
            for (const gapS of [0, 10]) {
              const plan = planBeat({
                shots: scenes(count, { lengthS, gapS }),
                spares: scenes(spareCount, { lengthS, gapS, fromS: count * (lengthS + gapS) }),
                targetS,
              });
              const where = `target=${targetS} scenes=${count}x${lengthS}s gap=${gapS} spares=${spareCount}`;
              expect(plan.slotS * plan.shotCount, where).toBeCloseTo(targetS, 6);
              if (plan.warning) continue; // declared impossible, and said so
              expect(plan.slotS, where).toBeLessThanOrEqual(MAX_CONTINUOUS_SOURCE_S + 1e-9);
              expect(longestContinuousRun(plan.shots, plan.slotS), where).toBeLessThanOrEqual(
                MAX_CONTINUOUS_SOURCE_S + 1e-9
              );
            }
          }
        }
      }
    }
  });

  it("measures continuity against the sped-up shot, not the slot", () => {
    // The copyright-free transform takes `slot * speed` seconds of source, so a
    // shot consumes more than its slot and lands closer to the next scene.
    const speedFor = () => 1.3;
    for (const targetS of [3.4, 5.5, 7]) {
      const plan = planBeat({
        shots: scenes(2, { lengthS: 6, gapS: 0 }),
        spares: [],
        targetS,
        speedFor,
      });
      if (plan.warning) continue;
      expect(longestContinuousRun(plan.shots, plan.slotS, speedFor)).toBeLessThanOrEqual(
        MAX_CONTINUOUS_SOURCE_S + 1e-9
      );
    }
  });
});

describe("focusWindow", () => {
  // lib/movie-recap-scenes.ts takes each scene's representative frame a third of
  // the way in, the vision pass describes THAT frame, and the narration model
  // picks the scene from that description. A shot that does not contain it shows
  // the wrong moment of the right scene.
  const describedMoment = (scene: SourceWindow) =>
    scene.sourceStartS + (scene.sourceEndS - scene.sourceStartS) / 3;

  it("contains the moment the scene was described from", () => {
    for (const sceneS of [2, 4, 6, 12]) {
      for (const playedS of [1, 1.4, 2.4, 3]) {
        const scene = { sourceStartS: 100, sourceEndS: 100 + sceneS };
        const { window } = focusWindow(scene, playedS);
        const at = describedMoment(scene);
        const where = `scene=${sceneS}s played=${playedS}s`;
        expect(window.sourceStartS, where).toBeLessThanOrEqual(at + 1e-9);
        expect(window.sourceEndS, where).toBeGreaterThanOrEqual(at - 1e-9);
      }
    }
  });

  it("stays inside the scene", () => {
    // Centring on a moment a third in would start before the scene does.
    const { window } = focusWindow({ sourceStartS: 10, sourceEndS: 14 }, 3);
    expect(window.sourceStartS).toBeGreaterThanOrEqual(10);
    expect(window.sourceEndS).toBeLessThanOrEqual(14);
    expect(window.sourceEndS - window.sourceStartS).toBeCloseTo(3, 6);
  });

  it("returns the whole scene when the slot outlasts it", () => {
    expect(focusWindow({ sourceStartS: 10, sourceEndS: 12 }, 2.6).window).toEqual({
      sourceStartS: 10,
      sourceEndS: 12,
    });
  });

  it("keeps the shot inside one uncut run of the film", () => {
    // Detection merges cuts closer than MIN_SCENE_S into the preceding scene, so
    // a 10s "scene" can contain the film's own edits. A shot laid across one
    // arrives as two — measured at 21 cuts in an export the planner made 11 of.
    const scene = { sourceStartS: 0, sourceEndS: 10 };
    const cuts = [1.2, 2.0, 6.0];
    // The described frame is a third in, at 3.33s, which is inside the [2, 6] run.
    const { window, room } = focusWindow(scene, 1.8, cuts);
    expect(room).toEqual({ sourceStartS: 2, sourceEndS: 6 });
    for (const at of cuts) {
      expect(at <= window.sourceStartS + 1e-9 || at >= window.sourceEndS - 1e-9, `cut at ${at}`).toBe(true);
    }
  });

  it("prefers the uncut run holding the described moment", () => {
    // Two runs are long enough; the described frame (a third in, 4s) is in the
    // second, so that is the one played even though the first is longer.
    const { room } = focusWindow({ sourceStartS: 0, sourceEndS: 12 }, 1.8, [3.5]);
    expect(room).toEqual({ sourceStartS: 3.5, sourceEndS: 12 });
  });

  it("plays across a cut rather than freeze-padding, when no run is long enough", () => {
    // Every run is under the slot. An original edit inside a shot still looks
    // like film; a short window held out to the slot looks like a bug.
    const scene = { sourceStartS: 0, sourceEndS: 6 };
    const { window } = focusWindow(scene, 2.5, [1, 2, 3, 4, 5]);
    expect(window.sourceEndS - window.sourceStartS).toBeCloseTo(2.5, 6);
    expect(window.sourceStartS).toBeLessThanOrEqual(2);
    expect(window.sourceEndS).toBeGreaterThanOrEqual(2);
  });

  it("never lays a planned shot across a cut when the scene has room", () => {
    const cuts = [7, 9.5, 22, 30.5];
    const plan = planBeat({
      shots: [
        { sourceStartS: 0, sourceEndS: 14 },
        { sourceStartS: 20, sourceEndS: 34 },
      ],
      spares: [],
      targetS: 4,
      cuts,
    });
    for (const shot of plan.shots) {
      for (const at of cuts) {
        expect(at <= shot.sourceStartS + 1e-9 || at >= shot.sourceEndS - 1e-9, `cut ${at} in ${JSON.stringify(shot)}`).toBe(
          true
        );
      }
    }
  });

  it("is what a planned shot plays, not the head of the scene", () => {
    // The old behaviour: a 12s scene under a 1.4s slot showed 0-1.4s.
    const plan = planBeat({ shots: [{ sourceStartS: 0, sourceEndS: 12 }], spares: [], targetS: 1.4 });
    expect(plan.shots[0].sourceStartS).toBeGreaterThan(0);
    expect(plan.shots[0].sourceStartS).toBeLessThanOrEqual(4);
    expect(plan.shots[0].sourceEndS).toBeGreaterThanOrEqual(4);
  });
});

describe("motion-aware placement", () => {
  // 0.25s buckets, matching the track detection writes.
  const track = (values: number[]): MotionTrack => ({ stepS: 0.25, values });
  // 10s of source: dead until 6s, lively after.
  const deadThenLively = track([...Array(24).fill(0.1), ...Array(16).fill(5)]);

  it("averages motion over a span", () => {
    expect(motionMean(deadThenLively, 0, 2)).toBeCloseTo(0.1, 6);
    expect(motionMean(deadThenLively, 6, 8)).toBeCloseTo(5, 6);
    expect(motionMean(deadThenLively, 100, 102)).toBe(0);
  });

  it("ignores the spike a cut puts in the motion signal", () => {
    // The track is PySceneDetect's own cut metric, so a bucket holding a cut
    // reads as enormous movement. Counting it made the scorer hunt for edits.
    const spiky = track([...Array(8).fill(1), 90, ...Array(31).fill(1)]);
    expect(motionMean(spiky, 0, 10)).toBeGreaterThan(3);
    expect(motionMean(spiky, 0, 10, [2.1])).toBeCloseTo(1, 6);
  });

  it("takes the placement with the fewest cuts when none is cut-free", () => {
    // Every 1.8s window of this scene straddles at least one cut; the motion
    // spike sits on the cut at 3s. It must not be drawn there.
    const scene = { sourceStartS: 0, sourceEndS: 4 };
    const cuts = [1, 2, 3];
    const spiky = track([...Array(12).fill(1), 90, ...Array(3).fill(1)]);
    const { window } = focusWindow(scene, 1.8, cuts, spiky);
    const inside = cuts.filter((at) => at > window.sourceStartS + 1e-6 && at < window.sourceEndS - 1e-6);
    expect(inside.length).toBe(1);
  });

  it("moves the window onto the lively part of the same run", () => {
    // Described moment is a third in, at 3.33s, which is dead footage. Without
    // motion the window sits there; with it, the shot moves to the action.
    const scene = { sourceStartS: 0, sourceEndS: 10 };
    const blind = focusWindow(scene, 1.8).window;
    const aware = focusWindow(scene, 1.8, [], deadThenLively).window;
    expect(blind.sourceStartS).toBeCloseTo(2.43, 2);
    expect(aware.sourceStartS).toBeGreaterThanOrEqual(6);
    expect(motionMean(deadThenLively, aware.sourceStartS, aware.sourceEndS)).toBeGreaterThan(
      motionMean(deadThenLively, blind.sourceStartS, blind.sourceEndS)
    );
  });

  it("does not wander for a marginal gain", () => {
    // Slightly livelier a long way off is not worth leaving the described
    // moment for — the drift penalty outprices it.
    const barelyBetter = track([...Array(24).fill(1), ...Array(16).fill(1.1)]);
    const window = focusWindow({ sourceStartS: 0, sourceEndS: 10 }, 1.8, [], barelyBetter).window;
    expect(window.sourceStartS).toBeLessThan(4);
  });

  it("stays inside its uncut run", () => {
    // The described moment (3.33s) puts the shot in the [0, 6.5] run. Most of
    // the lively footage is past that cut and is off limits — chasing it would
    // deliver the shot as two.
    const scene = { sourceStartS: 0, sourceEndS: 10 };
    const { window, room } = focusWindow(scene, 1.8, [6.5], deadThenLively);
    expect(room).toEqual({ sourceStartS: 0, sourceEndS: 6.5 });
    expect(window.sourceEndS).toBeLessThanOrEqual(6.5 + 1e-9);
    // It still takes the liveliest window available on its own side of the cut:
    // hard up against it, where the motion starts.
    expect(window.sourceEndS).toBeGreaterThan(6);
  });

  it("prefers a spare that can fill the slot over a livelier short one", () => {
    // A scene shorter than the slot is padded with held frames by the render,
    // which looks worse than a quiet shot that actually runs.
    const trackShort: MotionTrack = { stepS: 1, values: Array(400).fill(0.1) };
    for (let i = 120; i < 122; i++) trackShort.values[i] = 50; // lively but tiny
    const plan = planBeat({
      shots: [{ sourceStartS: 100, sourceEndS: 104 }],
      spares: [
        { sourceStartS: 120, sourceEndS: 120.8 },
        { sourceStartS: 130, sourceEndS: 136 },
      ],
      targetS: 4,
      motion: trackShort,
    });
    expect(plan.sparesUsed).toEqual([1]);
    expect(plan.warning).toBeNull();
  });

  it("says so when a beat has to be padded with held frames", () => {
    const plan = planBeat({
      shots: [{ sourceStartS: 0, sourceEndS: 1 }],
      spares: [],
      targetS: 2.4,
    });
    expect(plan.warning).toContain("held frames");
  });

  it("borrows the liveliest of the nearest spares, not simply the nearest", () => {
    // Both spares are in the same neighbourhood; the nearer one is dead.
    const track: MotionTrack = { stepS: 1, values: [] };
    track.values = Array(400).fill(0.1);
    for (let i = 160; i < 166; i++) track.values[i] = 8; // lively at 160-166s
    const plan = planBeat({
      shots: [{ sourceStartS: 100, sourceEndS: 104 }],
      spares: [
        { sourceStartS: 120, sourceEndS: 124 },
        { sourceStartS: 160, sourceEndS: 164 },
      ],
      targetS: 4,
      motion: track,
    });
    expect(plan.sparesUsed).toEqual([1]);
  });

  it("keeps proximity in charge of the neighbourhood", () => {
    // A livelier scene far outside the nearest candidates is never pulled in:
    // borrowed footage has to belong to this stretch of the film.
    const track: MotionTrack = { stepS: 1, values: Array(4000).fill(0.1) };
    for (let i = 3000; i < 3010; i++) track.values[i] = 50;
    const spares = Array.from({ length: 10 }, (_, i) => ({
      sourceStartS: 120 + i * 10,
      sourceEndS: 124 + i * 10,
    }));
    spares.push({ sourceStartS: 3000, sourceEndS: 3004 });
    const plan = planBeat({
      shots: [{ sourceStartS: 100, sourceEndS: 104 }],
      spares,
      targetS: 4,
      motion: track,
    });
    expect(plan.sparesUsed).not.toContain(spares.length - 1);
  });

  it("drops the deadest scene, not the last one", () => {
    // 3s of narration can only pay for two of these three scenes. The middle one
    // is dead, so it goes — the end of the beat used to be what was dropped.
    const track: MotionTrack = { stepS: 1, values: Array(200).fill(6) };
    for (let i = 20; i < 26; i++) track.values[i] = 0.1;
    const plan = planBeat({
      shots: [
        { sourceStartS: 0, sourceEndS: 4 },
        { sourceStartS: 20, sourceEndS: 24 },
        { sourceStartS: 40, sourceEndS: 44 },
      ],
      spares: [],
      targetS: 3,
      motion: track,
    });
    expect(plan.shotCount).toBe(2);
    expect(plan.shots.map((shot) => Math.floor(shot.sourceStartS / 20))).toEqual([0, 2]);
  });

  it("uses a quiet scene's best second rather than writing it off", () => {
    // A scene that is quiet by the FILM's standard — every bucket below the
    // moving floor, so nothing separates them on sustained motion. Mean motion
    // then breaks the tie and the scene still gets its best second, instead of
    // being written off against the rest of the film.
    const film = track([
      ...Array(16).fill(0.2),
      ...Array(24).fill(1.2),
      ...Array(200).fill(20),
    ]);
    const window = focusWindow({ sourceStartS: 0, sourceEndS: 10 }, 1.8, [], film).window;
    expect(window.sourceStartS).toBeGreaterThanOrEqual(4);
  });

  it("prefers a window that moves throughout over one with a single burst", () => {
    // 0-5s twitches once and is otherwise dead; 5-10s moves the whole way. Mean
    // motion alone rated them nearly equal, which is how 30% of a finished recap
    // came to be holding still.
    const burstVsSteady = track([
      ...Array(9).fill(0.1),
      40,
      ...Array(10).fill(0.1),
      ...Array(20).fill(6),
    ]);
    const window = focusWindow({ sourceStartS: 0, sourceEndS: 10 }, 1.8, [], burstVsSteady).window;
    expect(window.sourceStartS).toBeGreaterThanOrEqual(5);
  });
});

describe("playedSourceSeconds", () => {
  it("is the whole scene when the render speed-ramps or freeze-pads it", () => {
    expect(playedSourceSeconds(2, 2.2, null)).toBe(2); // freeze-pad
    expect(playedSourceSeconds(2, 1.8, null)).toBe(2); // ratio 0.9, inside the ramp band
  });

  it("is the slot when the render trims", () => {
    expect(playedSourceSeconds(6, 1.4, null)).toBe(1.4);
  });

  it("is slot * speed under the copyright-free transform, capped by the scene", () => {
    expect(playedSourceSeconds(6, 1.4, 1.3)).toBeCloseTo(1.82, 6);
    expect(playedSourceSeconds(1.5, 1.4, 1.3)).toBe(1.5);
  });
});

describe("segmentFilters", () => {
  it("resamples to a constant frame rate, last", () => {
    // `setpts` re-times frames without resampling them, so a slowed shot carries
    // fewer frames across the same slot. Concatenating that with `-c copy`
    // against a full-rate segment holds frames for two frame periods, which is a
    // visible stutter — measured at two per 1.4s shot before this existed.
    // `fps` has to come after `setpts`/`tpad`, or it resamples timing those
    // then overwrite.
    expect(segmentFilters("scale=720:1280", "setpts=PTS/0.9400")).toBe("scale=720:1280,setpts=PTS/0.9400,fps=30");
  });

  it("resamples even a segment with no retiming", () => {
    // A source that is not 30fps would otherwise concatenate against 30fps
    // segments at its own rate.
    expect(segmentFilters("scale=720:1280")).toBe("scale=720:1280,fps=30");
  });
});
