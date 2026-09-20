import { describe, expect, it } from "vitest";
import { clampBlurRect } from "./movie-recap";

describe("clampBlurRect", () => {
  it("keeps a region inside the frame", () => {
    expect(clampBlurRect({ x: 90, y: 90, width: 30, height: 20 })).toEqual({ x: 70, y: 80, width: 30, height: 20 });
  });

  it("never lets a region get too small to see", () => {
    expect(clampBlurRect({ x: 0, y: 0, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });

  it("never lets a region get bigger than the frame", () => {
    expect(clampBlurRect({ x: 10, y: 10, width: 200, height: 200 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
