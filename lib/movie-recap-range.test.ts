import { describe, expect, it } from "vitest";
import { selectMovieRecapBeatRange } from "./movie-recap-range";

const narration = ["first", "second", "third"].map((text) => ({ text, shots: [] }));
const timings = [
  { beat: 1, startS: 0, endS: 2, durationS: 2 },
  { beat: 2, startS: 2, endS: 5, durationS: 3 },
  { beat: 3, startS: 5, endS: 9, durationS: 4 },
];

describe("selectMovieRecapBeatRange", () => {
  it("keeps inclusive beats and rebases their audio timings to zero", () => {
    const range = selectMovieRecapBeatRange(narration, timings, 2, 3);
    expect(range.narration.map((beat) => beat.text)).toEqual(["second", "third"]);
    expect([range.startS, range.endS]).toEqual([2, 9]);
    expect(range.timings).toEqual([
      { beat: 2, startS: 0, endS: 3, durationS: 3 },
      { beat: 3, startS: 3, endS: 7, durationS: 4 },
    ]);
  });

  it("rejects a range beyond the current script", () => {
    expect(() => selectMovieRecapBeatRange(narration, timings, 3, 4)).toThrow();
  });
});
