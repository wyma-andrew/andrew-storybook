import { describe, expect, it } from "vitest";
import { recapShareOptions, recommendedRecapShare } from "./movie-recap-recap-length";

describe("recommendedRecapShare", () => {
  it("shrinks as the source gets longer", () => {
    expect(recommendedRecapShare(15 * 60)).toBe(0.28);
    expect(recommendedRecapShare(25 * 60)).toBe(0.22);
    expect(recommendedRecapShare(60 * 60)).toBe(0.14);
    expect(recommendedRecapShare(120 * 60)).toBe(0.1);
  });

  it("caps short sources at 30%", () => {
    expect(recommendedRecapShare(4 * 60)).toBe(0.3);
  });

  it("falls back when the length is unknown", () => {
    expect(recommendedRecapShare(0)).toBe(0.25);
  });
});

describe("recapShareOptions", () => {
  it("drops a preset that duplicates the recommendation and sorts by share", () => {
    expect(recapShareOptions(25 * 60)).toEqual([
      { share: 0.1, recommended: false },
      { share: 0.15, recommended: false },
      { share: 0.22, recommended: true },
      { share: 0.25, recommended: false },
      { share: 0.3, recommended: false },
    ]);
  });
});
