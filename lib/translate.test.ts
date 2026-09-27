import { describe, expect, it } from "vitest";
import { mergeSrtBlocks, parseSrtBlocks } from "./translate";

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
