import { describe, expect, it } from "vitest";
import { applyOverrides, cleanMotionOverrides, cleanOverrides, hasMotionOverrides, promptOverrides } from "./prompt-lab";

const part = (key: string, text: string) => ({ key, label: key, source: "test", text });

describe("prompt lab versions", () => {
  it("keeps only blocks edited away from the chapter's own prompt", () => {
    const original = [part("role", "A"), part("style", "S1"), part("rules", "R")];
    const edited = [part("role", "A"), part("style", "S1"), part("rules", "R2")];
    expect(promptOverrides(edited, original)).toEqual([{ key: "rules", label: "rules", text: "R2" }]);
  });

  it("applies a version onto another chapter's prompt and reports blocks it lacks", () => {
    const otherChapter = [part("role", "A"), part("style", "S2"), part("rules", "R")];
    const { parts, skipped } = applyOverrides(otherChapter, [
      { key: "rules", label: "Rules", text: "R2" },
      { key: "cozyAsmr", label: "Cozy ASMR", text: "X" },
    ]);
    expect(parts.map((p) => p.text)).toEqual(["A", "S2", "R2"]);
    expect(skipped.map((o) => o.key)).toEqual(["cozyAsmr"]);
  });

  it("drops malformed overrides", () => {
    expect(cleanOverrides([{ key: "a", text: "t" }, { key: 1 }, null, "x"])).toEqual([{ key: "a", label: "a", text: "t" }]);
  });
});

describe("cleanMotionOverrides", () => {
  it("keeps only known styles, modes and string text", () => {
    expect(
      cleanMotionOverrides({
        "sacred-cinematic": { normal: "walk", cinematic: "x", micro: 3 },
        "deleted-style": { normal: "y" },
        natural: null,
      })
    ).toEqual({ "sacred-cinematic": { normal: "walk" } });
  });

  it("treats non-objects as empty", () => {
    expect(cleanMotionOverrides(null)).toEqual({});
    expect(cleanMotionOverrides("x")).toEqual({});
    expect(hasMotionOverrides(cleanMotionOverrides([]))).toBe(false);
  });
});
