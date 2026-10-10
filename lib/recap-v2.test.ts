import { describe, expect, it } from "vitest";
import { buildRecapV2Units, recapV2CaptionChunks, type RecapV2Project } from "./recap-v2";
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

  it("closes on a clause once past the natural minimum, and on a sentence end", () => {
    expect(units[0].source).toBe("他回到家，发现妻子不见了。");
    expect(units[0].videoEnd).toBeCloseTo((units[0].speechEnd + 6) / 2);
  });

  it("forces a cut at the max duration when punctuation never comes", () => {
    const long = units.filter((unit) => unit.speechStart >= 6 && unit.speechStart < 13);
    expect(long.length).toBeGreaterThan(1);
    expect(units.map((unit) => unit.source).join("")).toBe(segments.map((segment) => segment.text).join(""));
  });

  it("splits on commas inside one FunASR segment", () => {
    const text = "我饱了，先去学校问妈妈，慢用二十岁了，还毛毛躁躁，到底不是亲生了，";
    const split = buildRecapV2Units([{ start: 75.09, end: 80.35, text }], stamped(text, 75.09, 0.18), 90);
    expect(split.length).toBeGreaterThan(1);
    expect(split[0].source).toBe("我饱了，先去学校问妈妈，");
    expect(split.map((unit) => unit.source).join("")).toBe(text);
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
      [{ start: 0, end: 2, text: "他回家了。" }, { start: 3, end: 9, text: loop }, { start: 10, end: 12, text: "警察来了。" }],
      [...stamped("他回家了", 0, 0.5), ...stamped(loop, 3, 0.2), ...stamped("警察来了", 10, 0.5)],
      12
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
      sourceWidth: 1920, sourceHeight: 1080, aspectRatio: "9:16", fitMode: "contain", zoom: 1.05, mirror: true,
      blurRegions: [{ x: 10, y: 80, width: 80, height: 15 }],
    } as RecapV2Project, 4, 4.4);
    expect(filter.indexOf("boxblur")).toBeLessThan(filter.indexOf("split[bg][fg]"));
    expect(filter.endsWith("tpad=stop_mode=clone:stop_duration=0.5[out]")).toBe(true);
  });
});
