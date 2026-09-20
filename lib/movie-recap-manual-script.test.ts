import { describe, expect, it } from "vitest";
import { MOVIE_RECAP_PLAYBACK_SPEED } from "./constants/movie-recap";
import {
  budgetCharsFor,
  groupBlocks,
  manualScriptOverruns,
  parseTimestampedBlocks,
} from "./movie-recap-manual-script";

describe("parseTimestampedBlocks", () => {
  it("runs each block to the next stamp, and the last to the end of the source", () => {
    const blocks = parseTimestampedBlocks("00:00:00\nfirst\n00:00:27\nsecond", 60);
    expect(blocks).toEqual([
      { startS: 0, endS: 27, text: "first" },
      { startS: 27, endS: 60, text: "second" },
    ]);
  });

  it("joins a block's wrapped lines into one line of narration", () => {
    const blocks = parseTimestampedBlocks("0:00\n one line\n  and its\n continuation ", 10);
    expect(blocks[0].text).toBe("one line and its continuation");
  });

  it("accepts MM:SS as well as HH:MM:SS", () => {
    expect(parseTimestampedBlocks("2:05\nlate", 200)[0].startS).toBe(125);
    expect(parseTimestampedBlocks("01:02:05\nlater", 5000)[0].startS).toBe(3725);
  });

  it("ignores a stamp that is part of a sentence", () => {
    // Only a stamp ALONE on its line starts a block; "at 00:01:00 he leaves" is
    // narration, and splitting on it would cut a sentence in half.
    const blocks = parseTimestampedBlocks("00:00:00\nhe leaves at 00:01:00 sharp", 60);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("he leaves at 00:01:00 sharp");
  });

  it("takes the words on the stamp's own line", () => {
    // One line per stamp: how the text comes out when it was pulled off a
    // video's own narration track. This layout used to parse as zero blocks.
    const blocks = parseTimestampedBlocks("00:00 he wakes\n00:03 he runs", 10);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ startS: 0, endS: 3, text: "he wakes" });
    expect(blocks[1]).toMatchObject({ startS: 3, endS: 10, text: "he runs" });
  });

  it("joins the stamp's own line with the lines under it", () => {
    const blocks = parseTimestampedBlocks("00:00 he wakes\nand then he runs", 10);
    expect(blocks[0].text).toBe("he wakes and then he runs");
  });

  it("drops a block that starts past the end of the source", () => {
    // Its footage is not there. A zero-length window would put narration over
    // nothing, which reads as a render bug rather than a bad paste.
    const blocks = parseTimestampedBlocks("00:00:00\nin range\n00:05:00\nout of range", 60);
    expect(blocks).toEqual([{ startS: 0, endS: 60, text: "in range" }]);
  });

  it("drops a stamp that goes backwards rather than reordering around it", () => {
    const blocks = parseTimestampedBlocks("00:00:10\na\n00:00:05\nb\n00:00:20\nc", 60);
    expect(blocks.map((block) => block.startS)).toEqual([10, 20]);
  });

  it("drops a stamp with no words under it", () => {
    const blocks = parseTimestampedBlocks("00:00:00\n\n00:00:10\nreal", 60);
    expect(blocks).toEqual([{ startS: 10, endS: 60, text: "real" }]);
  });

  it("returns nothing for text with no stamps at all", () => {
    expect(parseTimestampedBlocks("just some prose", 60)).toEqual([]);
    expect(parseTimestampedBlocks("", 60)).toEqual([]);
  });
});

describe("groupBlocks", () => {
  const block = (startS: number, endS: number) => ({ startS, endS, text: "x" });

  it("merges consecutive blocks until a group is wide enough", () => {
    const blocks = [];
    for (let start = 0; start < 60; start += 3) blocks.push(block(start, start + 3));
    const groups = groupBlocks(blocks, 25);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ startS: 0, endS: 27 });
    expect(groups[1]).toMatchObject({ startS: 27, endS: 60 });
  });

  it("leaves a block that is already wide enough alone", () => {
    const groups = groupBlocks([block(0, 40), block(40, 80)], 25);
    expect(groups).toHaveLength(2);
  });

  it("covers every block exactly once, in order", () => {
    const blocks = [];
    for (let start = 0; start < 61; start += 4) blocks.push(block(start, start + 4));
    const seen = groupBlocks(blocks, 25).flatMap((group) => group.blocks);
    expect(seen).toEqual(blocks.map((_, index) => index));
  });

  it("folds a short tail into the group before it", () => {
    // Otherwise the last two lines of a story get a 3s wall of their own, which
    // is the wall this exists to remove.
    const groups = groupBlocks([block(0, 30), block(30, 33)], 25);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ startS: 0, endS: 33, blocks: [0, 1] });
  });
});

describe("manualScriptOverruns", () => {
  const block = (startS: number, endS: number, text: string) => ({ startS, endS, text });
  // 18.2 characters a second, measured (lib/movie-recap-speech.ts): 600
  // characters is about 33s of speech.
  const long = "က".repeat(600);

  it("says nothing when the timestamps cover the writing", () => {
    expect(manualScriptOverruns([block(0, 60, long)])).toEqual([]);
  });

  it("does not fire on rounding", () => {
    // The estimate is good to about half a second. A warning that goes off on
    // that is a warning people stop reading.
    expect(manualScriptOverruns([block(0, 33, long)])).toEqual([]);
  });

  it("flags a block with far more narration than footage", () => {
    // The real case this exists for: 27s of video under a passage that takes
    // ~39s to read (history/movie-recap.md, 2026-09-19).
    const found = manualScriptOverruns([block(0, 5, long)]);
    expect(found).toHaveLength(1);
    expect(found[0].block).toBe(1);
    expect(found[0].footageS).toBeCloseTo(5 / MOVIE_RECAP_PLAYBACK_SPEED, 6);
    expect(found[0].spokenS).toBeGreaterThan(found[0].footageS);
  });

  it("flags a block whose footage is well short of its words", () => {
    // 600 characters is ~33s of speech; 18s of video cannot carry it, and
    // nothing downstream speeds the reading up to make it fit.
    const [only] = manualScriptOverruns([block(0, 18, long)]);
    expect(only?.block).toBe(1);
  });

  it("says how many seconds over and how many characters to cut", () => {
    // The whole point of the warning: the edit is a number, not a feeling.
    const budget = budgetCharsFor(0, 30);
    const [only] = manualScriptOverruns([block(0, 30, "က".repeat(budget + 120)), block(30, 60, "တို")]);
    expect(only.chars - only.budgetChars).toBe(120);
    expect(only.overS).toBeCloseTo(only.spokenS - only.footageS, 1);
    expect(only.overS).toBeGreaterThan(0);
  });

  it("numbers the groups as the user counts them", () => {
    const longer = "က".repeat(900);
    const found = manualScriptOverruns([block(0, 30, "တို"), block(30, 60, longer), block(60, 200, "တို")]);
    expect(found.map((entry) => entry.block)).toEqual([2]);
  });

  it("says nothing when a long line sits beside a short one inside a group", () => {
    // THE reason this is measured per group: the ribbon shares a group's footage
    // across its lines, so this pair is not an overrun and warning about it
    // teaches people to ignore the warning.
    const half = "က".repeat(300);
    expect(
      manualScriptOverruns([block(0, 2, half), block(2, 30, "တို"), block(30, 60, "တို")])
    ).toEqual([]);
  });
});
