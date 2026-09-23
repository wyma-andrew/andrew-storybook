import { describe, expect, it } from "vitest";
import { MOVIE_RECAP_NARRATION_PLAYBACK_RATE } from "./constants/movie-recap";
import { normalizeMovieRecapNarrationManifest } from "./movie-recap-manifest";
import { narrationDurationAtRate } from "./movie-recap-narration";

describe("normalizeMovieRecapNarrationManifest", () => {
  it("adopts the fixed narration rate without remeasuring cached audio", () => {
    const [beat] = normalizeMovieRecapNarrationManifest([{
      shots: [{ sourceStartS: 0, sourceEndS: 5 }],
      text: "beat",
      audioS: 4,
      narrationRate: 1.234,
    }])!;

    expect(beat.rawAudioS).toBeCloseTo(4.936, 6);
    expect(beat.audioS).toBeCloseTo(narrationDurationAtRate(4.936, MOVIE_RECAP_NARRATION_PLAYBACK_RATE), 6);
    expect(beat.narrationRate).toBe(MOVIE_RECAP_NARRATION_PLAYBACK_RATE);
  });

  it("leaves an unmeasured beat unchanged", () => {
    const beat = { shots: [{ sourceStartS: 0, sourceEndS: 5 }], text: "beat" };
    expect(normalizeMovieRecapNarrationManifest([beat])).toEqual([beat]);
  });
});
