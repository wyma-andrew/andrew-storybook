import { describe, expect, it } from "vitest";
import { sceneColorVars, sceneHue } from "./constants/scene-colors";

describe("sceneHue", () => {
  it("maps a scene number to the same hue every time", () => {
    expect(sceneHue(6)).toBe(sceneHue(6));
    expect(sceneHue(1)).toBe(0);
  });

  it("gives every scene number its own hue", () => {
    const hues = new Set(Array.from({ length: 60 }, (_, i) => sceneHue(i + 1).toFixed(2)));
    expect(hues.size).toBe(60);
  });

  it("keeps consecutive scenes far apart on the wheel", () => {
    for (let index = 1; index < 60; index++) {
      const gap = Math.abs(sceneHue(index + 1) - sceneHue(index));
      expect(Math.min(gap, 360 - gap)).toBeGreaterThan(100);
    }
  });

  it("stays in range for a non-positive index", () => {
    expect(sceneHue(0)).toBeGreaterThanOrEqual(0);
    expect(sceneHue(0)).toBeLessThan(360);
    expect(sceneHue(-3)).toBeGreaterThanOrEqual(0);
    expect(sceneHue(-3)).toBeLessThan(360);
  });
});

describe("sceneColorVars", () => {
  it("exposes only the hue — weight and text color come from the theme", () => {
    const vars = sceneColorVars(4) as Record<string, string>;
    expect(vars).toEqual({ "--scene-hue": sceneHue(4).toFixed(2) });
  });
});
