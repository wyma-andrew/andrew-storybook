import { describe, expect, it } from "vitest";
import { layoutRibbon, snapToCut, type RibbonBeat } from "./movie-recap-ribbon";

const beat = (blockIndex: number, blockStartS: number, audioS: number): RibbonBeat => ({
  blockIndex,
  blockStartS,
  audioS,
});

describe("snapToCut", () => {
  it("lands a jump on the film's own edit", () => {
    expect(snapToCut(27, [8, 14, 26.4, 33], 2)).toBe(26.4);
  });

  it("leaves the time alone when no cut is near enough", () => {
    expect(snapToCut(27, [8, 14, 33], 2)).toBe(27);
  });

  it("takes the nearer of two cuts", () => {
    expect(snapToCut(27, [26.2, 27.5], 2)).toBe(27.5);
  });
});

describe("layoutRibbon", () => {
  const cuts = [10, 20, 30, 40, 50, 60, 70, 80];

  it("gives every beat exactly its own audio length", () => {
    // THE point of the ribbon: the clip is the clock, so no beat is ever short
    // of footage and none has spare to freeze through.
    const beats = [beat(0, 0, 8), beat(0, 0, 6), beat(1, 20, 9)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    for (const [i, window] of windows.entries()) {
      expect(window.sourceEndS - window.sourceStartS).toBeCloseTo(beats[i].audioS, 3);
      expect(window.shortfallS).toBe(0);
    }
  });

  it("plays the source unbroken while the drift stays inside the cap", () => {
    // Block 2 is typed at 20s but the first block's words run to 22s. Two
    // seconds is invisible, and re-anchoring for it would be a visible jump.
    const beats = [beat(0, 0, 22), beat(1, 20, 10)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[1].sourceStartS).toBe(22);
    expect(windows[1].resynced).toBe(false);
  });

  it("re-anchors once the drift passes the cap, and lands on a cut", () => {
    const beats = [beat(0, 0, 32), beat(1, 20, 10)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[1].resynced).toBe(true);
    expect(windows[1].sourceStartS).toBe(20);
  });

  it("corrects a picture that has run ahead as well as one that lags", () => {
    // Short lines give footage back, so the next block would start early.
    const beats = [beat(0, 0, 3), beat(1, 20, 10)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[1].resynced).toBe(true);
    expect(windows[1].sourceStartS).toBe(20);
  });

  it("never re-anchors in the middle of a block", () => {
    // Two beats of one block, far past the cap: the correction waits for the
    // block boundary rather than cutting a sentence's picture in half.
    const beats = [beat(0, 0, 40), beat(0, 0, 10)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[1].resynced).toBe(false);
    expect(windows[1].sourceStartS).toBe(40);
  });

  it("starts on a cut near the first block's stamp", () => {
    const windows = layoutRibbon({ beats: [beat(0, 9.4, 5)], cuts, startS: 9.4, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[0].sourceStartS).toBe(10);
  });

  it("reports what the end of the film could not cover", () => {
    // The one place borrowing cannot help — there is nothing after the last
    // frame to take. The render holds a frame for the remainder.
    const windows = layoutRibbon({ beats: [beat(0, 0, 30)], cuts, startS: 0, endS: 20, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    expect(windows[0].sourceEndS).toBe(20);
    expect(windows[0].shortfallS).toBe(10);
  });

  it("keeps the windows in order and touching, apart from a re-anchor", () => {
    const beats = [beat(0, 0, 8), beat(0, 0, 8), beat(1, 20, 8)];
    const windows = layoutRibbon({ beats, cuts, startS: 0, endS: 100, driftCapS: 5, startSnapS: 1, resyncSnapS: 2 });
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].resynced) continue;
      expect(windows[i].sourceStartS).toBe(windows[i - 1].sourceEndS);
    }
  });
});
