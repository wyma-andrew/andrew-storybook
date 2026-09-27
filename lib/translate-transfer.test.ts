import { describe, expect, it } from "vitest";
import type { TranslateProject } from "./translate";
import { parseTranslateBundle, toTranslateBundle, translateBundlePatches } from "./translate-transfer";

const project = {
  name: "Film", sourceFileName: "film.mp4", sourceDurationSeconds: 60,
  srtFileName: "film.srt", srtText: "1\n00:00:01,000 --> 00:00:02,000\nhi\n",
  subtitleCues: [{ start: 1, end: 2, text: "hi" }],
  translatedSrtFileName: "film.my.srt", translatedSrtText: "1\n00:00:01,000 --> 00:00:02,000\nမင်္ဂလာပါ\n",
  subtitleTimingMode: "translated", blurRegions: [{ x: 8, y: 75, width: 84, height: 18 }], subtitleY: 90, subtitleSize: 5,
} as TranslateProject;

describe("translate bundle", () => {
  it("round-trips and sends timing after the SRT", () => {
    const bundle = parseTranslateBundle(JSON.stringify(toTranslateBundle(project)));
    const [content, timing] = translateBundlePatches(bundle);
    expect(content).toMatchObject({ name: "Film", srtText: project.srtText, translatedSrtText: project.translatedSrtText, subtitleY: 90 });
    expect(content).not.toHaveProperty("subtitleCues");
    expect(timing).toEqual({ subtitleCues: project.subtitleCues, subtitleTimingMode: "translated" });
  });

  it("drops a timing mode whose data is missing", () => {
    const bundle = toTranslateBundle({ ...project, subtitleCues: null, subtitleTimingMode: "aligned" });
    expect(translateBundlePatches(bundle)[1]).toEqual({});
  });

  it("rejects other JSON", () => {
    expect(() => parseTranslateBundle("{}")).toThrow("not a Translate project export");
    expect(() => parseTranslateBundle("nope")).toThrow("not valid JSON");
  });
});
