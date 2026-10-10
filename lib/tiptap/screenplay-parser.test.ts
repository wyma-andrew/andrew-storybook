import { describe, expect, it } from "vitest";
import { parseScreenplayText, serializeScreenplay } from "./screenplay-parser";

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

describe("serializeScreenplay", () => {
  it("round-trips every block type through the import parser", () => {
    const blocks = parseScreenplayText(`Title: ANGULIMALA
Scene: EXT. JALINI FOREST - DAY
Action: Wind moves through the trees.
Character: အင်္ဂုလိမာလ
Parenthetical: (shouting)
Dialog: ရပ်လိုက်စမ်း။
Voice Over: Once, the forest was silent.
Transition: CUT TO:
Scene: INT. HALL - NIGHT
Action: Lamps flicker.`);
    expect(parseScreenplayText(serializeScreenplay({ type: "doc", content: blocks }))).toEqual(blocks);
  });

  it("flattens hard breaks and skips empty blocks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "dialog", content: [{ type: "text", text: "One" }, { type: "hardBreak" }, { type: "text", text: "two" }] },
      ],
    };
    expect(serializeScreenplay(doc)).toBe("Dialog: One two");
  });
});
