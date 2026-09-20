import { describe, expect, it } from "vitest";
import {
  dominantRun,
  layoutBlockRibbon,
  MAX_SCENES_PER_BLOCK,
  MIN_SCENE_S,
  scenesInBlock,
  splitSceneIntoShots,
} from "./movie-recap-scene-plan";
import {
  MOVIE_RECAP_PLAYBACK_SPEED,
  MOVIE_RECAP_RIBBON_DRIFT_CAP_S,
  movieRecapPacing,
} from "./constants/movie-recap";

const wide = movieRecapPacing("16:9");
const tall = movieRecapPacing("9:16");
const lengthOf = (w: { sourceStartS: number; sourceEndS: number }) => w.sourceEndS - w.sourceStartS;
const total = (windows: { sourceStartS: number; sourceEndS: number }[]) =>
  windows.reduce((sum, w) => sum + lengthOf(w), 0);

describe("scenesInBlock", () => {
  it("tiles the block exactly — no second of it is skipped", () => {
    // THE invariant. The block's footage is the user's own timestamps; anything
    // this drops has to be paid back later as a held frame.
    const scenes = scenesInBlock(10, 40, [14, 21, 30.5, 36]);
    expect(scenes[0].sourceStartS).toBe(10);
    expect(scenes[scenes.length - 1].sourceEndS).toBe(40);
    expect(total(scenes)).toBeCloseTo(30, 6);
    for (let i = 1; i < scenes.length; i++) {
      expect(scenes[i].sourceStartS).toBe(scenes[i - 1].sourceEndS);
    }
  });

  it("ignores cuts outside the block", () => {
    expect(scenesInBlock(10, 20, [2, 5, 44])).toEqual([{ sourceStartS: 10, sourceEndS: 20 }]);
  });

  it("gives one scene back when the block has no cuts in it", () => {
    expect(scenesInBlock(0, 12, [])).toEqual([{ sourceStartS: 0, sourceEndS: 12 }]);
  });

  it("merges a burst of quick cuts instead of making slivers", () => {
    // Five cuts inside two seconds is one busy scene, not five scenes. Each
    // would otherwise get its own narration line, which nothing that short can
    // carry.
    const scenes = scenesInBlock(0, 20, [5, 5.2, 5.4, 5.6, 5.8, 12]);
    for (const scene of scenes) expect(lengthOf(scene)).toBeGreaterThanOrEqual(MIN_SCENE_S);
    expect(total(scenes)).toBeCloseTo(20, 6);
  });

  it("gives a fast-cut film beats a sentence can actually fill", () => {
    // THE regression guard for the granularity bug. A 60s stretch cut every 2s
    // used to become 30 beats of 2s each, and a Burmese sentence takes 3-8s to
    // say — every one of them overran (history/movie-recap.md, 2026-09-20).
    const cuts = Array.from({ length: 29 }, (_, i) => (i + 1) * 2);
    const scenes = scenesInBlock(0, 60, cuts, 5);
    for (const scene of scenes) expect(lengthOf(scene)).toBeGreaterThanOrEqual(5);
    expect(total(scenes)).toBeCloseTo(60, 6);
  });

  it("still cuts the picture as often as it did, whatever the beats do", () => {
    // The two limits are independent, and confusing them is the trap: merging
    // cuts makes a LONGER window, and that window is still divided into shots by
    // the continuity limit. A beat getting longer must never mean the picture
    // sits still. The floor is passed explicitly so this holds whatever
    // MIN_SCENE_S is currently set to.
    const cuts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const scenes = scenesInBlock(0, 12, cuts, 4);
    const shots = scenes.flatMap((scene) => splitSceneIntoShots(scene, wide, cuts));
    // Ten cuts collapse to a handful of beats...
    expect(scenes.length).toBeLessThan(5);
    for (const scene of scenes) expect(lengthOf(scene)).toBeGreaterThanOrEqual(4);
    // ...but the picture still changes every few seconds, and no second of the
    // block is lost on the way.
    for (const shot of shots) expect(lengthOf(shot)).toBeLessThanOrEqual(wide.maxContinuousSourceS + 1e-6);
    expect(shots.length).toBeGreaterThanOrEqual(scenes.length);
    expect(total(shots)).toBeCloseTo(12, 6);
  });

  it("never leaves a sliver at the end, where there is no cut to move", () => {
    const scenes = scenesInBlock(0, 10, [9.5]);
    expect(scenes).toEqual([{ sourceStartS: 0, sourceEndS: 10 }]);
  });

  it("caps how many scenes one block becomes", () => {
    // Each scene costs a keyframe, a share of a vision call and a TTS call of
    // its own, and a block's passage cannot fill twenty of them.
    const cuts = Array.from({ length: 40 }, (_, i) => (i + 1) * 2);
    const scenes = scenesInBlock(0, 100, cuts);
    expect(scenes.length).toBeLessThanOrEqual(MAX_SCENES_PER_BLOCK);
    expect(total(scenes)).toBeCloseTo(100, 6);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i].sourceStartS).toBe(scenes[i - 1].sourceEndS);
  });

  it("drops the quick cutaway, not the scene that carries the block", () => {
    // Merging shortest-first: the long scene in the middle has to survive a cap
    // that removes the quick cutaways around it (it grows, because the 2s tail
    // after it is one of the shortest and merges back into it).
    const scenes = scenesInBlock(0, 40, [2, 4, 6, 8, 38], 1, 3);
    expect(scenes).toHaveLength(3);
    expect(Math.max(...scenes.map((s) => s.sourceEndS - s.sourceStartS))).toBeGreaterThanOrEqual(30);
    expect(total(scenes)).toBeCloseTo(40, 6);
  });

  it("returns nothing for an empty or reversed block", () => {
    expect(scenesInBlock(10, 10, [])).toEqual([]);
    expect(scenesInBlock(10, 5, [])).toEqual([]);
  });
});

describe("splitSceneIntoShots", () => {
  it("keeps the pieces contiguous and adds up to the scene", () => {
    const shots = splitSceneIntoShots({ sourceStartS: 0, sourceEndS: 12 }, wide);
    expect(shots[0].sourceStartS).toBe(0);
    expect(shots[shots.length - 1].sourceEndS).toBe(12);
    for (let i = 1; i < shots.length; i++) expect(shots[i].sourceStartS).toBe(shots[i - 1].sourceEndS);
    expect(total(shots)).toBeCloseTo(12, 6);
  });

  it("holds every piece under the continuity limit", () => {
    for (const pacing of [wide, tall]) {
      for (const lengthS of [1, 3.2, 7, 12, 25]) {
        const shots = splitSceneIntoShots({ sourceStartS: 0, sourceEndS: lengthS }, pacing);
        const over = shots.filter((shot) => lengthOf(shot) > pacing.maxContinuousSourceS + 1e-6);
        // A scene shorter than two shot floors cannot be split; that is the only
        // case allowed through.
        if (lengthS >= pacing.minShotS * 2) expect(over).toHaveLength(0);
      }
    }
  });

  it("would rather hold one shot than flash two", () => {
    // 2.5s at a 2s floor: two pieces would be 1.25s each, under the floor.
    expect(splitSceneIntoShots({ sourceStartS: 0, sourceEndS: 2.5 }, wide)).toHaveLength(1);
  });

  it("never lays a shot across one of the film's own edits", () => {
    // THE reason `cuts` is a parameter. Beats span several real scenes whenever
    // short ones were merged to reach MIN_SCENE_S, and a shot that contains an
    // edit looks like one shot to the pipeline while changing picture halfway
    // through to the viewer (history/movie-recap.md, 2026-09-20).
    const cuts = [5, 9, 14];
    const shots = splitSceneIntoShots({ sourceStartS: 0, sourceEndS: 18 }, wide, cuts);
    for (const shot of shots) {
      const crossed = cuts.filter((at) => at > shot.sourceStartS + 1e-6 && at < shot.sourceEndS - 1e-6);
      expect(crossed).toHaveLength(0);
    }
    expect(total(shots)).toBeCloseTo(18, 6);
  });

  it("still holds every piece under the continuity limit when it splits on edits", () => {
    // An unbroken take between two edits is long footage like any other.
    const shots = splitSceneIntoShots({ sourceStartS: 0, sourceEndS: 20 }, wide, [12]);
    for (const shot of shots) expect(lengthOf(shot)).toBeLessThanOrEqual(wide.maxContinuousSourceS + 1e-6);
    expect(total(shots)).toBeCloseTo(20, 6);
  });

  it("swallows a run too short to be a shot rather than flashing it", () => {
    // 0.5s between two edits is not a shot. It joins its neighbour, which then
    // does contain an edit — the lesser of the two problems, and what the floor
    // exists to choose.
    const shots = splitSceneIntoShots({ sourceStartS: 0, sourceEndS: 9 }, wide, [4, 4.5]);
    for (const shot of shots) expect(lengthOf(shot)).toBeGreaterThanOrEqual(wide.minShotS - 1e-6);
    expect(total(shots)).toBeCloseTo(9, 6);
  });

  it("cuts a long scene more often on 9:16 than on 16:9", () => {
    // The only thing the aspect ratio may change is presentation — here, how
    // often the same footage is cut. See history/movie-recap.md.
    const scene = { sourceStartS: 0, sourceEndS: 12 };
    expect(splitSceneIntoShots(scene, tall).length).toBeGreaterThan(splitSceneIntoShots(scene, wide).length);
  });
});

describe("dominantRun", () => {
  it("picks the stretch the beat mostly is, not the cutaway", () => {
    // A frame a third of the way into the merged window would land at 6s — the
    // 2s cutaway — and the vision pass would describe that instead of the 12s
    // scene the beat is about.
    expect(dominantRun({ sourceStartS: 0, sourceEndS: 18 }, [4, 6])).toEqual({ sourceStartS: 6, sourceEndS: 18 });
  });

  it("hands back the whole window when nothing is cut inside it", () => {
    expect(dominantRun({ sourceStartS: 3, sourceEndS: 9 }, [1, 20])).toEqual({ sourceStartS: 3, sourceEndS: 9 });
  });

  it("stays inside the window it was given", () => {
    const run = dominantRun({ sourceStartS: 10, sourceEndS: 20 }, [12, 17]);
    expect(run.sourceStartS).toBeGreaterThanOrEqual(10);
    expect(run.sourceEndS).toBeLessThanOrEqual(20);
  });
});

describe("layoutBlockRibbon", () => {
  const lengths = (windows: { sourceStartS: number; sourceEndS: number }[]) =>
    windows.map((w) => Number((w.sourceEndS - w.sourceStartS).toFixed(3)));
  // Every window is SOURCE seconds and plays at MOVIE_RECAP_PLAYBACK_SPEED, so a
  // beat wanting N seconds of speech owns N * speed of film.
  const screen = (windows: { sourceStartS: number; sourceEndS: number }[]) =>
    lengths(windows).map((value) => Number((value / MOVIE_RECAP_PLAYBACK_SPEED).toFixed(3)));

  it("gives each beat exactly its own narration length when the block can afford it", () => {
    const { windows, shortfallS } = layoutBlockRibbon({ blockStartS: 0, blockEndS: 24, audioS: [8, 6, 10] });
    expect(screen(windows).slice(0, 2)).toEqual([8, 6]);
    // The last beat takes whatever the block has left rather than stopping
    // short of the next timestamp; the render trims the surplus.
    expect(screen(windows)[2]).toBeGreaterThanOrEqual(10);
    expect(shortfallS).toBe(0);
  });

  it("lets a long line take footage from the beat after it", () => {
    // THE point. The words fell 12/4/8 across scenes of 8/8/8 — beat 1 used to
    // freeze while beat 2 sat spare.
    const { windows, shortfallS } = layoutBlockRibbon({ blockStartS: 0, blockEndS: 24, audioS: [12, 4, 8] });
    expect(screen(windows).slice(0, 2)).toEqual([12, 4]);
    expect(screen(windows)[2]).toBeGreaterThanOrEqual(8);
    expect(shortfallS).toBe(0);
  });

  it("keeps a beat within the drift cap of its own stamp", () => {
    // THE reason the cap exists: laid out by speech length alone, beat 2 here
    // starts seconds from the moment its words were written against, and speaks
    // over the tail of beat 1's scene.
    const free = layoutBlockRibbon({ blockStartS: 0, blockEndS: 60, audioS: [30, 10, 20] });
    const capped = layoutBlockRibbon({
      blockStartS: 0,
      blockEndS: 60,
      audioS: [30, 10, 20],
      anchorS: [0, 10, 40],
    });
    expect(Math.abs(free.windows[1].sourceStartS - 10)).toBeGreaterThan(MOVIE_RECAP_RIBBON_DRIFT_CAP_S);
    for (const [index, anchor] of [0, 10, 40].entries()) {
      expect(Math.abs(capped.windows[index].sourceStartS - anchor)).toBeLessThanOrEqual(
        MOVIE_RECAP_RIBBON_DRIFT_CAP_S + 1e-6
      );
    }
  });

  it("leaves the boundary free between two beats out of the same block", () => {
    // They share a stamp, so there is nothing between them to be near — the
    // split is the sentence split, and speech length is the only guide.
    const shared = layoutBlockRibbon({ blockStartS: 0, blockEndS: 40, audioS: [10, 10, 20], anchorS: [0, 0, 20] });
    expect(shared.windows[1].sourceStartS).toBeCloseTo(10 * MOVIE_RECAP_PLAYBACK_SPEED, 3);
  });

  it("takes a film cut when one is inside the drift cap", () => {
    // Free: the boundary was allowed to move that far anyway, so landing it on a
    // cut costs no footage and the picture changes where the film changed it.
    const { windows, shortfallS } = layoutBlockRibbon({
      blockStartS: 0,
      blockEndS: 60,
      audioS: [20, 20, 20],
      anchorS: [0, 20, 40],
      cuts: [19.7, 40.3],
    });
    expect(windows[1].sourceStartS).toBe(19.7);
    expect(windows[2].sourceStartS).toBe(40.3);
    expect(shortfallS).toBe(0);
  });

  it("ignores a cut outside the drift cap", () => {
    const { windows } = layoutBlockRibbon({
      blockStartS: 0,
      blockEndS: 60,
      audioS: [20, 20, 20],
      anchorS: [0, 20, 40],
      cuts: [12, 55],
    });
    expect(windows[1].sourceStartS).not.toBe(12);
    expect(Math.abs(windows[1].sourceStartS - 20)).toBeLessThanOrEqual(MOVIE_RECAP_RIBBON_DRIFT_CAP_S + 1e-6);
  });

  it("never crosses the block's own edges", () => {
    // The user's timestamps are the one thing here that is not negotiable.
    const { windows } = layoutBlockRibbon({ blockStartS: 30, blockEndS: 54, audioS: [20, 20, 20] });
    expect(windows[0].sourceStartS).toBe(30);
    expect(windows[windows.length - 1].sourceEndS).toBe(54);
    for (const window of windows) {
      expect(window.sourceStartS).toBeGreaterThanOrEqual(30);
      expect(window.sourceEndS).toBeLessThanOrEqual(54);
    }
  });

  it("shares a block-wide shortfall instead of dumping it on the last beat", () => {
    // 60s of words over 30s of film: every beat holds half, rather than two
    // beats playing in full and the third being a 20-second still.
    const { windows, shortfallS } = layoutBlockRibbon({ blockStartS: 0, blockEndS: 30, audioS: [20, 20, 20] });
    expect(lengths(windows)).toEqual([10, 10, 10]);
    expect(shortfallS).toBeCloseTo(60 - 30 / MOVIE_RECAP_PLAYBACK_SPEED, 3);
  });

  it("leaves the windows touching, in order", () => {
    const { windows } = layoutBlockRibbon({ blockStartS: 5, blockEndS: 29, audioS: [7, 3, 9, 5] });
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].sourceStartS).toBe(windows[i - 1].sourceEndS);
    }
  });

  it("survives a block with one beat, and one with none", () => {
    expect(lengths(layoutBlockRibbon({ blockStartS: 0, blockEndS: 12, audioS: [5] }).windows)).toEqual([12]);
    expect(layoutBlockRibbon({ blockStartS: 0, blockEndS: 12, audioS: [] }).windows).toEqual([]);
  });
});
