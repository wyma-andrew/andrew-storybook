import { describe, expect, it } from "vitest";
import { MOVIE_RECAP_PACING } from "./constants/movie-recap";
import { keyframeFractions, SINGLE_KEYFRAME_FRACTION } from "./movie-recap-scenes";

describe("keyframeFractions", () => {
  it("keeps the single frame at the historical third", () => {
    // Load-bearing, not cosmetic: focusWindow anchors a shot on the described
    // moment, so moving this moves every 16:9 cut.
    expect(keyframeFractions(1)).toEqual([SINGLE_KEYFRAME_FRACTION]);
    expect(SINGLE_KEYFRAME_FRACTION).toBeCloseTo(1 / 3, 6);
  });

  it("spreads several frames with a half-step inset at each end", () => {
    // The first has to clear the cut it follows and the last has to stop short
    // of the next one, or the vision pass describes a fade.
    expect(keyframeFractions(3)).toEqual([1 / 6, 1 / 2, 5 / 6]);
  });

  it("never places a frame on a scene boundary", () => {
    for (const count of [1, 2, 3, 4, 5, 8]) {
      for (const fraction of keyframeFractions(count)) {
        expect(fraction).toBeGreaterThan(0);
        expect(fraction).toBeLessThan(1);
      }
    }
  });

  it("returns one fraction per frame for every pacing profile", () => {
    for (const pacing of Object.values(MOVIE_RECAP_PACING)) {
      expect(keyframeFractions(pacing.keyframesPerScene)).toHaveLength(pacing.keyframesPerScene);
    }
  });
});
