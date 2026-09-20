import { describe, expect, it } from "vitest";
import { MOVIE_RECAP_PLAYBACK_SPEED } from "./constants/movie-recap";
import { beatFootageS, beatOverrunS } from "./movie-recap";

const beat = (shots: [number, number][], audioS?: number) => ({
  shots: shots.map(([sourceStartS, sourceEndS]) => ({ sourceStartS, sourceEndS })),
  text: "…",
  audioS,
});

describe("beatFootageS", () => {
  it("adds up every shot under the beat, as the screen seconds they play for", () => {
    expect(beatFootageS(beat([[0, 3], [3, 7]]))).toBeCloseTo(7 / MOVIE_RECAP_PLAYBACK_SPEED, 6);
  });

  it("is zero for a beat with no shots", () => {
    expect(beatFootageS(beat([]))).toBe(0);
  });
});

describe("beatOverrunS", () => {
  it("reports how far the narration runs past its footage", () => {
    // The only number that matters at the script step: this is a held frame in
    // the finished video, and the fix is the user's.
    expect(beatOverrunS(beat([[0, 6]], 8.3))).toBeCloseTo(8.3 - 6 / MOVIE_RECAP_PLAYBACK_SPEED, 2);
  });

  it("is zero when the line fits", () => {
    expect(beatOverrunS(beat([[0, 8]], 6.2))).toBe(0);
  });

  it("stays silent about a beat that has not been spoken yet", () => {
    // A script from before measuring existed, or a mock. Guessing an overrun
    // from nothing would put a red number next to a line that may be fine.
    //
    // THE TRAP: zero here does NOT mean the beat fits. A real script left by an
    // older render had 58 beats and not one measurement, and the summary read
    // them all as fitting — anything counting "beats that fit" has to check for
    // a measurement first, not just for a zero.
    expect(beatOverrunS(beat([[0, 2]]))).toBe(0);
  });
});
