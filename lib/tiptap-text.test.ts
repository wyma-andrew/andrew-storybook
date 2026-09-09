import { describe, expect, it } from "vitest";
import { tiptapToText, tiptapVoiceOvers } from "./tiptap-text";

const document = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Rain crosses the valley." }] },
    { type: "voiceOver", content: [{ type: "text", text: "  We thought the drought would never end.  " }] },
    { type: "voiceOver" },
    { type: "voiceOver", content: [{ type: "text", text: "Then the river returned." }] },
  ],
};

describe("Tiptap Voice Over conversion", () => {
  it("tags Voice Over lines for AI input", () => {
    expect(tiptapToText(document)).toContain("[VOICE_OVER]   We thought the drought would never end.  ");
  });

  it("extracts non-empty narration in source order", () => {
    expect(tiptapVoiceOvers(document)).toEqual([
      "We thought the drought would never end.",
      "Then the river returned.",
    ]);
  });
});
