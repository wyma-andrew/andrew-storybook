import { describe, expect, it } from "vitest";
import { buildOverrunPrompt, parseBeatEdits } from "./movie-recap-beat-transfer";

const beat = (text: string, sourceS: number, audioS?: number) => ({
  text,
  shots: [{ sourceStartS: 0, sourceEndS: sourceS }],
  audioS,
});

describe("buildOverrunPrompt", () => {
  it("is empty when every beat fits", () => {
    expect(buildOverrunPrompt([beat("တို", 30, 2)])).toBe("");
  });

  it("lists only the beats that overrun, numbered as the UI numbers them", () => {
    const prompt = buildOverrunPrompt([beat("တခု", 30, 2), beat("နှစ်ခု", 2, 9), beat("သုံးခု", 30, 3)]);
    expect(prompt).toContain("[Beat 2 |");
    expect(prompt).not.toContain("[Beat 1 |");
    expect(prompt).not.toContain("[Beat 3 |");
    expect(prompt).toContain("နှစ်ခု");
  });

  it("says how many seconds over, and how many characters that is to REMOVE", () => {
    // Not how many fit: that reads as a length to rewrite to, and a chat given a
    // length overshoots it. See lib/movie-recap-beat-transfer.ts.
    const [header] = buildOverrunPrompt([beat("က".repeat(200), 2, 9)]).match(/\[Beat 1[^\]]*\]/) ?? [];
    expect(header).toMatch(/\d+\.\ds over/);
    expect(header).toMatch(/remove about \d+ characters/);
    expect(header).not.toMatch(/fit/);
  });
});

describe("parseBeatEdits", () => {
  it("reads the headers back", () => {
    expect(parseBeatEdits("[Beat 1 | 0.3s over]\nတိုပြီ\n\n[Beat 3]\nဒါလည်း", 3)).toEqual([
      { index: 0, text: "တိုပြီ" },
      { index: 2, text: "ဒါလည်း" },
    ]);
  });

  it("drops whatever a chat put before the first header", () => {
    expect(parseBeatEdits("Here you go!\n\n[Beat 1]\nတို", 1)).toEqual([{ index: 0, text: "တို" }]);
  });

  it("joins a beat that came back wrapped over several lines", () => {
    expect(parseBeatEdits("[Beat 1]\nတခု\nနှစ်ခု", 1)).toEqual([{ index: 0, text: "တခု နှစ်ခု" }]);
  });

  it("ignores a header with nothing under it rather than emptying that beat", () => {
    expect(parseBeatEdits("[Beat 1]\n\n[Beat 2]\nတို", 2)).toEqual([{ index: 1, text: "တို" }]);
  });

  it("drops a beat number the script does not have", () => {
    // Otherwise a model that renumbered its answer would land an edit on the
    // wrong line, and the wrong line is worse than no line.
    expect(parseBeatEdits("[Beat 9]\nတို", 3)).toEqual([]);
    expect(parseBeatEdits("[Beat 0]\nတို", 3)).toEqual([]);
  });

  it("finds nothing in a reply with no headers", () => {
    expect(parseBeatEdits("just some prose", 3)).toEqual([]);
  });
});
