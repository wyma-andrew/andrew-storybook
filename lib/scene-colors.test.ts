import { describe, expect, it } from "vitest";
import { SCENE_COLORS, sceneColor } from "./constants/scene-colors";

describe("sceneColor", () => {
  it("maps a scene number to the same color every time", () => {
    expect(sceneColor(6)).toBe(sceneColor(6));
    expect(sceneColor(1)).toBe(SCENE_COLORS[0]);
    expect(sceneColor(6)).toBe(SCENE_COLORS[5]);
  });

  it("cycles past the end of the palette", () => {
    expect(sceneColor(SCENE_COLORS.length + 1)).toBe(SCENE_COLORS[0]);
    expect(sceneColor(SCENE_COLORS.length * 2 + 3)).toBe(SCENE_COLORS[2]);
  });

  it("never returns undefined for a non-positive index", () => {
    expect(sceneColor(0)).toBeDefined();
    expect(sceneColor(-1)).toBeDefined();
  });
});
