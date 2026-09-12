import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOT_SCALE,
  SHOT_SCALE_OPTIONS,
  findShotScale,
  isShotScale,
  resolveShotOptics,
  resolveShotScale,
} from "./constants/shot-scales";

describe("shot scales", () => {
  it("every scale has an optics line, and none of them mention lighting", () => {
    for (const option of SHOT_SCALE_OPTIONS) {
      expect(option.optics.length).toBeGreaterThan(0);
      expect(option.optics.toLowerCase()).not.toMatch(/sunlight|lamp|shadow|highlight/);
    }
  });

  it("falls back to the neutral middle for an unknown value", () => {
    expect(resolveShotScale("cowboy")).toBe(DEFAULT_SHOT_SCALE);
    expect(resolveShotScale(null)).toBe(DEFAULT_SHOT_SCALE);
    expect(isShotScale("extreme-close")).toBe(true);
    expect(isShotScale("huge")).toBe(false);
  });

  it("composes no framing line for a shot with no stored scale", () => {
    expect(resolveShotOptics(null)).toBeNull();
    expect(resolveShotOptics("nonsense")).toBeNull();
    expect(resolveShotOptics("wide")).toBe(findShotScale("wide").optics);
  });

  it("gives a wide deep focus and an extreme close-up a dissolved background", () => {
    expect(findShotScale("wide").optics).toMatch(/deep focus/i);
    expect(findShotScale("extreme-close").optics).toMatch(/blurred organic wash/i);
  });
});
