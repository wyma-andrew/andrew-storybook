import { describe, expect, it } from "vitest";
import { parseScreenplayText } from "./screenplay-parser";

describe("parseScreenplayText Voice Over labels", () => {
  it.each(["Voice Over", "Voiceover", "VO", "Narration"])("parses %s", (label) => {
    expect(parseScreenplayText(`${label}: Once, the river remembered.`)).toEqual([
      { type: "voiceOver", content: [{ type: "text", text: "Once, the river remembered." }] },
    ]);
  });

  it("does not guess that ordinary unlabelled prose is Voice Over", () => {
    expect(parseScreenplayText("Once, the river remembered.")[0]?.type).toBe("paragraph");
  });
});
