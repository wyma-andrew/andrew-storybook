import { describe, expect, it } from "vitest";
import { crossfadeFromPreviousClip } from "./movie-recap-render";

describe("crossfadeFromPreviousClip", () => {
  it("dissolves from the start of the skipped second at the previous clip's speed", () => {
    const fade = crossfadeFromPreviousClip({
      previousEndS: 3,
      previousSpeed: 0.75,
      nextStartS: 4,
      slotFrames: 120,
      fps: 30,
      crossfadeS: 0.2,
    });
    expect(fade).toEqual({ frames: 6, durationS: 0.2, tailStartS: 3, tailSourceS: (7 / 30) * 0.75 });
  });

  it("skips the first clip, backward jumps, and gaps too short for the tail", () => {
    const base = { previousSpeed: 0.75, slotFrames: 120, fps: 30, crossfadeS: 0.2 };
    expect(crossfadeFromPreviousClip({ ...base, previousEndS: null, nextStartS: 4 })).toBeNull();
    expect(crossfadeFromPreviousClip({ ...base, previousEndS: 10, nextStartS: 4 })).toBeNull();
    expect(crossfadeFromPreviousClip({ ...base, previousEndS: 3.95, nextStartS: 4 })).toBeNull();
  });

  it("skips slots too short to hold the dissolve", () => {
    expect(
      crossfadeFromPreviousClip({ previousEndS: 3, previousSpeed: 0.75, nextStartS: 4, slotFrames: 12, fps: 30, crossfadeS: 0.2 })
    ).toBeNull();
  });
});
