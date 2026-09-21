import { describe, expect, it } from "vitest";
import { formatMovieRecapSourceTranscript } from "./movie-recap-source-transcript";

describe("formatMovieRecapSourceTranscript", () => {
  it("keeps timestamped source lines and removes translation lines", () => {
    expect(formatMovieRecapSourceTranscript(
      "00:00 那个护工\nThat caregiver,\n\n00:02 就是你妈吧？\nis your mother, right?",
    )).toBe("00:00 那个护工\n00:02 就是你妈吧？");
  });

  it("removes standalone timestamps and keeps the text before the extra stamp", () => {
    expect(formatMovieRecapSourceTranscript("00:00 In a forest, Troy wakes up in terrible\n00:03"))
      .toBe("00:00 In a forest, Troy wakes up in terrible");
  });

  it("splits timestamped lines pasted on one line", () => {
    expect(formatMovieRecapSourceTranscript("00:00 first 00:03 second")).toBe("00:00 first\n00:03 second");
  });
});
