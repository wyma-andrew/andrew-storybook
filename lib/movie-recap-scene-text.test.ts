import { describe, expect, it } from "vitest";
import { resolveSceneTexts, splitIntoSentences, splitPassageByDuration } from "./movie-recap-scene-text";

const squash = (value: string) => value.replace(/\s+/g, "");
const S1 = "သူမက တံခါးကို ဖွင့်လိုက်တယ်။";
const S2 = "အခန်းထဲမှာ ဘယ်သူမှ မရှိဘူး။";
const S3 = "စားပွဲပေါ်မှာ စာတစ်စောင် ကျန်နေတယ်။";
const S4 = "သူမ ဖတ်ပြီးတော့ ငိုလိုက်တယ်။";
const PASSAGE = [S1, S2, S3, S4].join(" ");

describe("splitIntoSentences", () => {
  it("keeps the sentence mark on the sentence it ends", () => {
    expect(splitIntoSentences(PASSAGE)).toEqual([S1, S2, S3, S4]);
  });

  it("keeps a trailing fragment that never got its mark", () => {
    expect(splitIntoSentences(`${S1} ဆက်ပြီး`)).toEqual([S1, "ဆက်ပြီး"]);
  });
});

describe("splitPassageByDuration", () => {
  it("loses nothing, whatever the scene lengths", () => {
    // THE invariant: this is the user's own writing, and a split that drops a
    // clause has quietly rewritten their story.
    for (const seconds of [[5, 5], [2, 8], [3, 3, 3], [1, 1, 1, 1], [10, 2, 2, 6]]) {
      const parts = splitPassageByDuration(PASSAGE, seconds);
      expect(parts).toHaveLength(seconds.length);
      expect(squash(parts.join(""))).toBe(squash(PASSAGE));
    }
  });

  it("gives a longer scene more of the passage", () => {
    const [short, long] = splitPassageByDuration(PASSAGE, [2, 20]);
    expect(long.length).toBeGreaterThan(short.length);
  });

  it("never breaks a sentence in half when it does not have to", () => {
    for (const part of splitPassageByDuration(PASSAGE, [5, 5])) {
      expect(part.endsWith("။")).toBe(true);
    }
  });

  it("breaks one long sentence at its clauses when there are more scenes than sentences", () => {
    const long = "မိုးရွာနေတဲ့ ညမှာ၊ သူက လမ်းပေါ်ကို ထွက်လာပြီး၊ ကားတစ်စီးကို စောင့်နေတယ်။";
    const parts = splitPassageByDuration(long, [3, 3]);
    expect(parts.filter(Boolean).length).toBe(2);
    expect(squash(parts.join(""))).toBe(squash(long));
  });

  it("hands the whole passage back for a single scene", () => {
    expect(splitPassageByDuration(PASSAGE, [12])).toEqual([PASSAGE]);
  });
});

describe("resolveSceneTexts", () => {
  it("takes the model's split when it kept every character", () => {
    const parts = [
      { sceneIndex: 0, text: `${S1} ${S2}` },
      { sceneIndex: 1, text: `${S3} ${S4}` },
    ];
    const result = resolveSceneTexts(PASSAGE, [5, 5], parts);
    expect(result.usedModel).toBe(true);
    expect(result.texts[0]).toBe(`${S1} ${S2}`);
  });

  it("throws the split away when the model rewrote the words", () => {
    // The one failure that must never reach the render: the narration is the
    // user's own Burmese, and a "tidied" sentence is not theirs any more.
    const parts = [
      { sceneIndex: 0, text: "သူမက တံခါးဖွင့်တယ်။" },
      { sceneIndex: 1, text: `${S3} ${S4}` },
    ];
    const result = resolveSceneTexts(PASSAGE, [5, 5], parts);
    expect(result.usedModel).toBe(false);
    expect(squash(result.texts.join(""))).toBe(squash(PASSAGE));
  });

  it("throws it away when the model lost or reordered a scene", () => {
    expect(resolveSceneTexts(PASSAGE, [5, 5], [{ sceneIndex: 0, text: PASSAGE }]).usedModel).toBe(false);
    expect(
      resolveSceneTexts(PASSAGE, [5, 5], [
        { sceneIndex: 1, text: `${S1} ${S2}` },
        { sceneIndex: 2, text: `${S3} ${S4}` },
      ]).usedModel
    ).toBe(false);
  });

  it("falls back when the pass returned nothing at all", () => {
    const result = resolveSceneTexts(PASSAGE, [5, 5], null);
    expect(result.usedModel).toBe(false);
    expect(squash(result.texts.join(""))).toBe(squash(PASSAGE));
  });
});
