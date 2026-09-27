import { describe, expect, it } from "vitest";
import { splitSubtitleChunks, timeSubtitlesToSpeech, type SpeechWord } from "./translate-timing";

function chineseWords(text: string, start: number, perChar = 0.25): SpeechWord[] {
  return Array.from(text).map((word, index) => ({ word, start: start + index * perChar, end: start + (index + 1) * perChar }));
}

describe("splitSubtitleChunks", () => {
  it("splits at spaces, punctuation and sentence ends", () => {
    expect(splitSubtitleChunks("你好。我是小明 今天天气很好")).toEqual(["你好。", "我是小明今天天气很好"].map((text) => text.replace("明今", "明 今")));
  });

  it("keeps spaced punctuation with the text before it", () => {
    expect(splitSubtitleChunks("从 国 外 回 来 了 。 妈 ， 我 就 知 道")).toEqual(["从 国 外 回 来 了 。", "妈 ， 我 就 知 道"]);
  });

  it("caps long unbroken CJK text", () => {
    const chunks = splitSubtitleChunks("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十");
    expect(chunks.length).toBe(2);
    expect(chunks.join("")).toHaveLength(30);
  });

  it("keeps short Latin phrases together", () => {
    expect(splitSubtitleChunks("Hello there. How are you doing today, my old friend? I missed you all this time, really.")).toEqual([
      "Hello there.", "How are you doing today, my old friend?", "I missed you all this time, really.",
    ]);
  });
});

describe("timeSubtitlesToSpeech", () => {
  it("shows each sentence only while it is spoken inside one long cue", () => {
    const words = [...chineseWords("你好吗", 1), ...chineseWords("我很好谢谢", 6)];
    const { cues, aligned } = timeSubtitlesToSpeech([{ start: 0, end: 10, text: "你好吗？我很好，谢谢。" }], words, 20);
    expect(aligned).toBe(1);
    expect(cues.map((cue) => cue.text)).toEqual(["你好吗？", "我很好，谢谢。"]);
    expect(cues[0].start).toBeCloseTo(0.92);
    expect(cues[0].end).toBeCloseTo(2);
    expect(cues[1].start).toBeCloseTo(5.92);
    expect(cues[1].end).toBeCloseTo(7.5);
  });

  it("tolerates transcription differences", () => {
    const words = chineseWords("今天天汽很好我们去公圆", 3, 0.4);
    const { cues } = timeSubtitlesToSpeech([{ start: 2, end: 8, text: "今天天气很好。我们去公园吧。" }], words, 20);
    expect(cues).toHaveLength(2);
    expect(cues[1].start).toBeGreaterThan(5);
  });

  it("keeps a cue whose speech cannot be found", () => {
    const cue = { start: 2, end: 4, text: "完全不同的内容" };
    const { cues, aligned } = timeSubtitlesToSpeech([cue], chineseWords("另外一些话语", 2.5), 20);
    expect(aligned).toBe(0);
    expect(cues).toEqual([cue]);
  });
});
