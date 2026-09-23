import { describe, expect, it } from "vitest";
import { narrationHash, replaceNarrationBeatTiming } from "./movie-recap-narration";

const azure = { providerId: "azure", id: "azure-thiha" };

describe("narrationHash", () => {
  it("gives the same key for the same words in the same voice", () => {
    // The whole point: a re-render must find what the last one synthesized.
    expect(narrationHash(azure, "မင်္ဂလာပါ")).toBe(narrationHash(azure, "မင်္ဂလာပါ"));
  });

  it("changes when the words change", () => {
    expect(narrationHash(azure, "one")).not.toBe(narrationHash(azure, "two"));
  });

  it("changes when the voice changes", () => {
    // Otherwise switching voices would replay the old voice's audio.
    expect(narrationHash(azure, "same")).not.toBe(narrationHash({ providerId: "azure", id: "azure-nilar" }, "same"));
    expect(narrationHash(azure, "same")).not.toBe(narrationHash({ providerId: "voxcpm", id: "azure-thiha" }, "same"));
  });

  it("does not depend on where the line sits in the script", () => {
    // Beat number is deliberately not in the key. Reordering the script, or
    // editing one line, must not invalidate every other line's audio — that is
    // what makes an edit cost one synthesis instead of thirty-two.
    const lines = ["first", "second", "third"];
    const before = lines.map((line) => narrationHash(azure, line));
    const after = [...lines].reverse().map((line) => narrationHash(azure, line));
    expect(new Set(before)).toEqual(new Set(after));
  });

  it("cannot be collided by moving the boundary between voice and text", () => {
    // The parts are joined with a newline, so a voice id ending in one must not
    // produce the same key as a text starting with one.
    expect(narrationHash({ providerId: "azure", id: "a" }, "b")).not.toBe(
      narrationHash({ providerId: "azure", id: "a\nb" }, "")
    );
  });
});

describe("replaceNarrationBeatTiming", () => {
  const timings = [
    { beat: 1, startS: 0, endS: 2, durationS: 2 },
    { beat: 2, startS: 2, endS: 5, durationS: 3 },
    { beat: 3, startS: 5, endS: 9, durationS: 4 },
  ];

  it("replaces one duration and shifts only the following beats", () => {
    expect(replaceNarrationBeatTiming(timings, 1, 4.5)).toEqual([
      timings[0],
      { beat: 2, startS: 2, endS: 6.5, durationS: 4.5 },
      { beat: 3, startS: 6.5, endS: 10.5, durationS: 4 },
    ]);
  });

  it("also shifts following beats backward when the replacement is shorter", () => {
    expect(replaceNarrationBeatTiming(timings, 0, 1)[2]).toEqual({
      beat: 3,
      startS: 4,
      endS: 8,
      durationS: 4,
    });
  });
});
