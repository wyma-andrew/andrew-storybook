import { describe, expect, it } from "vitest";
import {
  MOVIE_RECAP_MAX_PLAYBACK_SPEED,
  MOVIE_RECAP_PLAYBACK_SPEED,
} from "./constants/movie-recap";
import { buildMovieRecapSceneTimingPlan } from "./movie-recap-scene-plan";

function planFor(sourceS: number, narrationS: number) {
  const [group] = buildMovieRecapSceneTimingPlan({
    narration: [{ text: "beat", shots: [{ sourceStartS: 0, sourceEndS: sourceS }], audioS: narrationS }],
  }).groups;
  return group;
}

describe("buildMovieRecapSceneTimingPlan speed", () => {
  it("keeps the baseline speed when footage and narration match", () => {
    const group = planFor(3, 3 / MOVIE_RECAP_PLAYBACK_SPEED);
    expect(group.videoSpeed).toBe(MOVIE_RECAP_PLAYBACK_SPEED);
  });

  it("speeds spare footage up to fit instead of trimming it", () => {
    const group = planFor(3, 3.3);
    expect(group.videoSpeed).toBeGreaterThan(MOVIE_RECAP_PLAYBACK_SPEED);
    expect(group.videoSpeed).toBeLessThanOrEqual(MOVIE_RECAP_MAX_PLAYBACK_SPEED);
    expect(group.trimS).toBeLessThan(1 / 30);
  });

  it("caps the speed-up and trims only what is still left", () => {
    const group = planFor(3, 2);
    expect(group.videoSpeed).toBe(MOVIE_RECAP_MAX_PLAYBACK_SPEED);
    expect(group.trimS).toBeCloseTo(3 / MOVIE_RECAP_MAX_PLAYBACK_SPEED - 2, 1);
  });

  it("slows short footage only as much as needed and does not freeze", () => {
    const group = planFor(3, 6);
    expect(group.videoSpeed).toBeLessThan(0.6);
    expect(group.footageS).toBeGreaterThanOrEqual(group.targetS);
    expect(group.freezeS).toBe(0);
  });
});
