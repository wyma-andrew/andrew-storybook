import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./map-concurrent";

describe("mapConcurrent", () => {
  it("preserves input order while bounding active work", async () => {
    let active = 0;
    let peak = 0;
    const values = await mapConcurrent([30, 5, 20, 10], 2, async (delay, index) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return index;
    });

    expect(values).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });
});
