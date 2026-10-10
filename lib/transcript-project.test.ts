import { describe, expect, it } from "vitest";
import { transcriptFromSegments } from "./transcript-project";

describe("transcriptFromSegments", () => {
  it("joins speech into running text and breaks paragraphs on long pauses", () => {
    expect(transcriptFromSegments([
      { start: 0, end: 2, text: " မင်္ဂလာပါ။ " },
      { start: 2.3, end: 4, text: "ဒီနေ့ ဘာလုပ်မလဲ။" },
      { start: 7, end: 9, text: "ကျောင်းသွားမယ်။" },
      { start: 9.2, end: 9.5, text: "  " },
    ])).toBe("မင်္ဂလာပါ။ ဒီနေ့ ဘာလုပ်မလဲ။\n\nကျောင်းသွားမယ်။");
  });
});
