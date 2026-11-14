import { describe, expect, it } from "vitest";
import { buildRecapV2Units, recapV2CaptionChunks, recapV2OutputSize, type RecapV2Project } from "./recap-v2";
import { findNearDuplicates, findRepeatedNextLines, foreignLetters, isNote, latinWords } from "./recap-v2-checks";
import { repeatedLineShare } from "./recap-v2-transcribe";
import { planSplitterParts, splitterPartLabel } from "./splitter";
import { geminiKeys, toGeminiSchema } from "./gemini";
import { captionTimes, shortPauseBounds } from "./recap-v2-audio";
import { planRecapV2Timeline, recapV2PartFilter, recapV2SyncFilter } from "./recap-v2-render";

function stamped(text: string, start: number, step: number) {
  return Array.from(text.replace(/[，。！？]/g, ""), (word, index) => ({ word, start: start + index * step, end: start + index * step + step * 0.9 }));
}

describe("buildRecapV2Units", () => {
  const segments = [
    { start: 0.5, end: 1.6, text: "他回到家，" },
    { start: 1.7, end: 3.4, text: "发现妻子不见了。" },
    { start: 6, end: 13, text: "他找遍了整个城市却一无所获最后只能报警求助" },
    { start: 13.2, end: 15, text: "警察来了。" },
  ];
  const words = [
    ...stamped("他回到家", 0.5, 0.27),
    ...stamped("发现妻子不见了", 1.7, 0.24),
    ...stamped("他找遍了整个城市却一无所获最后只能报警求助", 6, 0.33),
    ...stamped("警察来了", 13.2, 0.45),
  ];
  const units = buildRecapV2Units(segments, words, 20);

  it("tiles the whole source without gaps", () => {
    expect(units[0].videoStart).toBe(0);
    expect(units.at(-1)!.videoEnd).toBe(20);
    for (let i = 1; i < units.length; i++) expect(units[i].videoStart).toBe(units[i - 1].videoEnd);
  });

  it("keeps a whole sentence on one line, across a comma", () => {
    expect(units[0].source).toBe("他回到家，发现妻子不见了。");
    expect(units[0].videoEnd).toBeCloseTo((units[0].speechEnd + 6) / 2);
  });

  it("runs an unmarked sentence on to the next mark under 10s, and keeps every word", () => {
    expect(units.map((unit) => unit.source)).toEqual(["他回到家，发现妻子不见了。", "他找遍了整个城市却一无所获最后只能报警求助警察来了。"]);
  });

  it("ends an unmarked line where its segment ends once past 10s", () => {
    const long = "他找遍了整个城市却一无所获最后只能报警求助他又找了很久";
    const split = buildRecapV2Units(
      [{ start: 0, end: 11, text: long }, { start: 11.1, end: 13, text: "警察来了。" }],
      [...stamped(long, 0, 0.42), ...stamped("警察来了", 11.1, 0.45)], 14
    );
    expect(split.map((unit) => unit.source)).toEqual([long, "警察来了。"]);
  });

  it("splits a long sentence at a comma only after 6.5s", () => {
    const text = "我饱了，先去学校问妈妈，慢用二十岁了，还毛毛躁躁，到底不是亲生了，你说是不是呢，我也不知道该怎么办了，";
    const split = buildRecapV2Units([{ start: 75, end: 93, text }], stamped(text, 75, 0.4), 95, { segmentBreaks: false });
    expect(split.length).toBeGreaterThan(1);
    expect(split[0].speechEnd - split[0].speechStart).toBeGreaterThanOrEqual(6.5);
    expect(split.map((unit) => unit.source).join("")).toBe(text);
  });

  it("joins Whisper words with their own spacing", () => {
    const spaced = buildRecapV2Units(
      [{ start: 0, end: 2, text: "He came home." }],
      [{ word: " He", start: 0, end: 0.4 }, { word: " came", start: 0.4, end: 0.9 }, { word: " home.", start: 0.9, end: 1.5 }],
      3, { segmentBreaks: false }
    );
    expect(spaced[0].source).toBe("He came home.");
  });

  it("does not end a sentence on an abbreviation", () => {
    const words = [{ word: " Mr.", start: 0, end: 0.3 }, { word: " Han", start: 0.3, end: 0.6 }, { word: " left.", start: 0.6, end: 1 }];
    expect(buildRecapV2Units([{ start: 0, end: 1, text: "Mr. Han left." }], words, 2, { segmentBreaks: false })).toHaveLength(1);
  });

  it("folds a tiny repeated name into the next unit", () => {
    const repeated = buildRecapV2Units(
      [{ start: 0, end: 0.3, text: "林浩。" }, { start: 0.5, end: 3, text: "林浩回家了。" }],
      [{ word: "林浩", start: 0, end: 0.3 }, { word: "林浩", start: 0.5, end: 1 }, { word: "回", start: 1, end: 1.5 }, { word: "家", start: 1.5, end: 2 }, { word: "了", start: 2, end: 2.5 }],
      5
    );
    expect(repeated).toHaveLength(1);
    expect(repeated[0].speechStart).toBe(0);
    expect(repeated[0].source).toBe("林浩回家了。");
  });
});

describe("hallucination filter", () => {
  it("drops a unit made only of a long one-character loop, and its picture goes to its neighbours", () => {
    const loop = "我".repeat(30);
    const units = buildRecapV2Units(
      [{ start: 0, end: 2, text: "他回家了。" }, { start: 3, end: 9, text: loop }, { start: 11, end: 13, text: "警察来了。" }],
      [...stamped("他回家了", 0, 0.5), ...stamped(loop, 3, 0.2), ...stamped("警察来了", 11, 0.5)],
      13
    );
    expect(units.map((unit) => unit.source)).toEqual(["他回家了。", "警察来了。"]);
    expect(units[0].videoEnd).toBe(units[1].videoStart);
  });

  it("keeps a short ordinary repetition", () => {
    const units = buildRecapV2Units([{ start: 0, end: 2, text: "冲冲冲！" }], stamped("冲冲冲", 0, 0.6), 2);
    expect(units).toHaveLength(1);
  });
});

describe("recapV2CaptionChunks", () => {
  it("shows a long line a sentence at a time", () => {
    expect(recapV2CaptionChunks("သမီးဝပြီ၊ ကျောင်းကို အရင်သွားလိုက်ဦးမယ်။ အမေ ဖြည်းဖြည်းစားနော်။")).toEqual([
      "သမီးဝပြီ၊ ကျောင်းကို အရင်သွားလိုက်ဦးမယ်။", "အမေ ဖြည်းဖြည်းစားနော်။",
    ]);
  });
});

describe("recapV2SyncFilter", () => {
  it("retimes exactly when within max speed", () => {
    expect(recapV2SyncFilter(4, 5)).toBe("setpts=1.250000000*(PTS-STARTPTS),fps=30");
  });

  it("plays at max speed and cuts the tail when the line is shorter still", () => {
    expect(recapV2SyncFilter(4, 2)).toBe("setpts=0.800000000*(PTS-STARTPTS),trim=duration=2.000000,setpts=PTS-STARTPTS,fps=30");
  });
});

describe("shortPauseBounds", () => {
  const rate = 1000;
  const clip = new Int16Array(3000);
  clip.fill(8000, 500, 1500);

  it("keeps 0.05s before and 0.20s after the speech", () => {
    expect(shortPauseBounds(clip, rate, 0)).toEqual({ first: 450, last: 1700 });
  });

  it("keeps more of the clip when the window needs it, but never more than the clip", () => {
    expect(shortPauseBounds(clip, rate, 2)).toEqual({ first: 450, last: 2450 });
    expect(shortPauseBounds(clip, rate, 5)).toEqual({ first: 0, last: 3000 });
  });
});

describe("captionTimes", () => {
  const rate = 1000;
  // 0.2s lead silence, 1.0s speech, 0.5s pause, 0.5s speech, 0.3s tail.
  const clip = new Int16Array(2500);
  clip.fill(8000, 200, 1200);
  clip.fill(8000, 1700, 2200);

  it("waits for the voice, switches where it resumes after a pause, and clears after it stops", () => {
    const times = captionTimes(clip, rate, [30, 30]);
    expect(times.starts).toEqual([0.2, 1.7]);
    expect(times.end).toBeCloseTo(2.2 + 0.3);
  });

  it("keeps the length estimate when there is no pause", () => {
    const steady = new Int16Array(1200);
    steady.fill(8000, 200, 1200);
    const [first, second] = captionTimes(steady, rate, [10, 10]).starts;
    expect(first).toBeCloseTo(0.2);
    expect(second).toBeCloseTo(0.7);
  });
});

describe("planRecapV2Timeline", () => {
  it("locks frames to the cumulative narration clock", () => {
    const units = [0, 1, 2].map((i) => ({ id: i + 1, speechStart: i * 4, speechEnd: i * 4 + 3, videoStart: i * 4, videoEnd: i * 4 + 4, source: "", text: "x" }));
    const timeline = planRecapV2Timeline(units, [3.333, 4.111, 2.777]);
    const total = timeline.reduce((sum, item) => sum + item.audioS, 0);
    const frames = timeline.reduce((sum, item) => sum + item.frames, 0);
    expect(Math.abs(frames / 30 - total)).toBeLessThanOrEqual(0.5 / 30);
  });
});

describe("recapV2PartFilter", () => {
  it("blurs the source before framing and ends on one output", () => {
    const filter = recapV2PartFilter({
      sourceWidth: 1920, sourceHeight: 1080, aspectRatio: "9:16", fitMode: "blur", quality: "1080", zoom: 1.05, mirror: true,
      blurRegions: [{ x: 10, y: 80, width: 80, height: 15 }],
    } as unknown as RecapV2Project, 4, 4.4);
    expect(filter.indexOf("boxblur")).toBeLessThan(filter.indexOf("split[bg][fg]"));
    expect(filter.endsWith("tpad=stop_mode=clone:stop_duration=0.5[out]")).toBe(true);
  });
});

describe("recapV2OutputSize", () => {
  it("follows the quality and keeps the source shape for Original", () => {
    expect(recapV2OutputSize({ aspectRatio: "16:9", quality: "1080", sourceWidth: 1, sourceHeight: 1 })).toEqual([1920, 1080]);
    expect(recapV2OutputSize({ aspectRatio: "9:16", quality: "720", sourceWidth: 1, sourceHeight: 1 })).toEqual([720, 1280]);
    expect(recapV2OutputSize({ aspectRatio: "original", quality: "1080", sourceWidth: 3840, sourceHeight: 1600 })).toEqual([1920, 800]);
    expect(recapV2OutputSize({ aspectRatio: "original", quality: "1080", sourceWidth: 1280, sourceHeight: 720 })).toEqual([1280, 720]);
  });
});

describe("translation checks", () => {
  it("finds letters of another script and English words outside brackets", () => {
    expect(foreignLetters("მისခန်း")).toEqual(["მ", "ი", "ს"]);
    expect(latinWords("ဇွန်ဘီ (Zombie) က Robot ကို")).toEqual(["Robot"]);
  });

  it("treats a bracket-only line as a note", () => {
    expect(isNote("(ရှေ့စာကြောင်း၏ အဆက်)")).toBe(true);
    expect(isNote("သူ အိမ်ပြန်လာတယ်။")).toBe(false);
  });

  it("finds a line that repeats the end of the one before it", () => {
    expect(findRepeatedNextLines([
      { id: 1, source: "He came home and found his wife gone.", translation: "သူ အိမ် ပြန်ရောက် တော့ မိန်းမ ပျောက် နေ တာ တွေ့ တယ်" },
      { id: 2, source: "found his wife gone.", translation: "မိန်းမ ပျောက် နေ တာ တွေ့ တယ်" },
    ])).toEqual([]);
    expect(findRepeatedNextLines([
      { id: 1, source: "He came home", translation: "သူ အိမ် ပြန်ရောက် တော့ မိန်းမ ပျောက် နေ တာ တွေ့ တယ်" },
      { id: 2, source: "and called the police.", translation: "မိန်းမ ပျောက် နေ တာ တွေ့ တယ်" },
    ])).toEqual([[1, 2]]);
  });

  it("finds two nearby lines that say the same thing", () => {
    const same = "သူ့ မိန်းမ ပျောက်သွားတာကို သူ တွေ့လိုက်ရတယ်";
    expect(findNearDuplicates([
      { id: 1, source: "He found his wife gone.", translation: same },
      { id: 2, source: "The police arrived.", translation: same },
    ])).toEqual([[1, 2]]);
  });
});

describe("repeatedLineShare", () => {
  it("measures lines that repeat one of the five before them", () => {
    const loop = Array.from({ length: 10 }, (_, i) => ({ start: i, end: i + 1, text: "I'm not going to do it." }));
    expect(repeatedLineShare(loop).share).toBeCloseTo(0.9);
  });
});

describe("splitter", () => {
  it("labels parts in either digit system", () => {
    expect(splitterPartLabel("Part {n}/{total}", 2, 5)).toBe("Part 2/5");
    expect(splitterPartLabel("အပိုင်း {mm}/{total}", 2, 5)).toBe("အပိုင်း ၂/၅");
  });

  it("cuts in the pause after the part's time is up, and folds a short tail in", () => {
    // Speech: three loud frames and a short dip, with one 1s pause at 185s.
    const levels = Float32Array.from({ length: Math.round(400 / 0.05) }, (_, i) => i % 4 === 3 ? -45 : -15);
    levels.fill(-60, Math.round(185 / 0.05), Math.round(186 / 0.05));
    const parts = planSplitterParts(400, 180, { smart: true, maxExtraS: 20, levels });
    expect(parts[0].cut).toBe("pause");
    expect(parts[0].end).toBeGreaterThan(185);
    expect(parts[0].end).toBeLessThan(186);
    expect(planSplitterParts(370, 180, { smart: false }).map((part) => part.end)).toEqual([180, 370]);
  });
});

describe("gemini", () => {
  it("reads every key, in order, without repeats", () => {
    const saved = { ...process.env };
    process.env.GEMINI_API_KEYS = "a, b";
    process.env.GEMINI_API_KEY = "b";
    process.env.GEMINI_API_KEY_10 = "d";
    process.env.GEMINI_API_KEY_2 = "c";
    expect(geminiKeys()).toEqual(["a", "b", "c", "d"]);
    process.env = saved;
  });

  it("turns a strict JSON schema into Gemini's schema", () => {
    expect(toGeminiSchema({ type: "object", additionalProperties: false, properties: { type: { type: "string" } } }))
      .toEqual({ type: "OBJECT", properties: { type: { type: "STRING" } } });
  });
});
