import { describe, expect, it } from "vitest";
import { applyCueEdit, formatCueTime, formatTimecode, frameIndex, frameTime, mergeSrtBlocks, nearestFrameRate, parseCueTime, parseSrtBlocks, timelineTickStep } from "./translate";

const block = (number: number, text: string) => `${number}\n00:00:0${number},000 --> 00:00:0${number},500\n${text}\n`;

describe("mergeSrtBlocks", () => {
  it("adds new numbers and updates existing ones", () => {
    const existing = [block(1, "a"), block(2, "b")].join("\n");
    const result = mergeSrtBlocks(existing, [block(2, "B"), block(3, "c")].join("\n"));
    expect([result.added, result.updated]).toEqual([1, 1]);
    expect(parseSrtBlocks(result.text).map((item) => [item.number, item.text])).toEqual([[1, "a"], [2, "B"], [3, "c"]]);
  });

  it("keeps batch numbers when earlier blocks are missing", () => {
    const result = mergeSrtBlocks(null, block(5, "e"));
    expect(parseSrtBlocks(result.text)[0].number).toBe(5);
  });
});

describe("applyCueEdit", () => {
  const cues = [{ start: 0, end: 2, text: "a" }, { start: 2, end: 4, text: "b" }, { start: 4, end: 6, text: "c" }];

  it("trims the neighbours an edit overlaps", () => {
    const result = applyCueEdit(cues, 1, { start: 1.5, end: 4.5, text: "b" });
    expect(result.error).toBeNull();
    expect(result.cues.map((cue) => [cue.start, cue.end])).toEqual([[0, 1.5], [1.5, 4.5], [4.5, 6]]);
  });

  it("leaves neighbours alone without overlap", () => {
    expect(applyCueEdit(cues, 1, { start: 2.2, end: 3.8, text: "b" }).cues[0].end).toBe(2);
  });

  it("refuses an edit that would leave a neighbour under 0.3s", () => {
    expect(applyCueEdit(cues, 1, { start: 2, end: 5.9, text: "b" }).error).toMatch(/at most 0:05.70/);
  });
});

describe("cue time format", () => {
  it("round-trips minutes and hours", () => {
    expect(formatCueTime(92.02)).toBe("1:32.02");
    expect(formatCueTime(3723.5)).toBe("1:02:03.50");
    expect(parseCueTime("1:32.02")).toBeCloseTo(92.02);
    expect(parseCueTime("1:02:03.5")).toBeCloseTo(3723.5);
  });

  it("accepts plain seconds and rejects junk", () => {
    expect(parseCueTime("92.5")).toBe(92.5);
    expect(parseCueTime("1:3x")).toBeNaN();
    expect(parseCueTime("1.5:30")).toBeNaN();
  });
});

describe("parseSrtBlocks", () => {
  it("reads chat output without blank lines, inside a fence, with bold numbers", () => {
    const pasted = "```srt\n**101**\n00:01:00,000 --> 00:01:01,000\nမင်္ဂလာပါ\n102\n00:01:02,000 --> 00:01:03,500\nနေကောင်းလား\n```";
    expect(parseSrtBlocks(pasted).map((block) => [block.number, block.numbered, block.text])).toEqual([
      [101, true, "မင်္ဂလာပါ"], [102, true, "နေကောင်းလား"],
    ]);
  });

  it("never merges blocks without a number", () => {
    const result = mergeSrtBlocks(block(1, "a"), "00:00:05,000 --> 00:00:06,000\nx\n");
    expect([result.added, result.updated, result.skipped]).toEqual([0, 0, 1]);
    expect(parseSrtBlocks(result.text).map((item) => item.text)).toEqual(["a"]);
  });
});

describe("mergeSrtBlocks with synced reference", () => {
  it("numbers blocks by their synced timing when the pasted number is wrong", () => {
    const reference = [{ start: 1, end: 1.5, text: "x" }, { start: 2, end: 2.5, text: "y" }];
    const pasted = "1\n00:00:01,000 --> 00:00:01,500\nA\n\n1\n00:00:02,000 --> 00:00:02,500\nB\n";
    const result = mergeSrtBlocks(null, pasted, reference);
    expect([result.added, result.updated, result.renumbered, result.duplicates]).toEqual([2, 0, 1, 0]);
    expect(parseSrtBlocks(result.text).map((item) => [item.number, item.text])).toEqual([[1, "A"], [2, "B"]]);
  });
});

describe("timeline frames", () => {
  it("snaps measured rates to common frame rates", () => {
    expect(nearestFrameRate(29.6)).toBe(29.97);
    expect(nearestFrameRate(24.3)).toBe(24);
    expect(nearestFrameRate(49.6)).toBe(50);
  });

  it("round-trips frame index and seek time", () => {
    for (const fps of [23.976, 25, 29.97, 60]) {
      for (const frame of [0, 1, 57_070, 90_000]) expect(frameIndex(frameTime(frame, fps), fps)).toBe(frame);
    }
  });

  it("formats timecode with frames", () => {
    expect(formatTimecode(0, 30)).toBe("0:00:00");
    expect(formatTimecode(1901.7, 30)).toBe("31:41:21");
    expect(formatTimecode(3725.5, 25)).toBe("1:02:05:12");
  });

  it("picks a tick step wide enough to label", () => {
    expect(timelineTickStep(1, 30)).toBe(120);
    expect(timelineTickStep(300, 30)).toBeCloseTo(10 / 30);
    expect(timelineTickStep(3000, 30)).toBeCloseTo(1 / 30);
  });
});
