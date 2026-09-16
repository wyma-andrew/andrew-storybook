import { describe, expect, it } from "vitest";
import { planBeatShots, shotsNeededFor } from "./movie-recap-render";

const scenes = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("planBeatShots", () => {
  it("cuts roughly every 1.4s", () => {
    const plan = planBeatShots(scenes(4), 5.6);
    expect(plan.shotCount).toBe(4);
    expect(plan.slotS).toBeCloseTo(1.4, 6);
  });

  it("rounds toward more cuts, not fewer", () => {
    // 2s is 1.43 shots at the target length. Rounding down would hold one shot
    // for 2s, which is the pacing this replaced.
    expect(planBeatShots(scenes(4), 2).shotCount).toBe(2);
    expect(planBeatShots(scenes(5), 4).shotCount).toBe(3);
  });

  it("no shot exceeds the 2.4s hold cap when the beat has scenes for it", () => {
    for (const targetS of [2.5, 3.2, 4.8, 7, 9.6]) {
      const enough = shotsNeededFor(targetS);
      const plan = planBeatShots(scenes(enough), targetS);
      expect(plan.slotS).toBeLessThanOrEqual(2.4 + 1e-9);
    }
  });

  it("still holds long when the beat has only one scene and nothing to borrow", () => {
    // The render borrows unused scenes to avoid this; with an empty pool the
    // hold stands, because repeating footage inside a beat looks worse.
    expect(planBeatShots(scenes(1), 6).slotS).toBe(6);
  });

  it("drops scenes the line is too short to pay for", () => {
    // 2s of speech cannot carry four scenes without each falling under the 1s
    // floor, so it keeps two and gives them 1s each.
    const plan = planBeatShots(scenes(4), 2);
    expect(plan.shotCount).toBe(2);
    expect(plan.slotS).toBe(1);
  });

  it("never returns a shot under the one-second floor", () => {
    // The floor is why sub-second cuts in a rendered video come from cuts inside
    // the SOURCE footage, not from this planner.
    for (const targetS of [1, 1.4, 2.2, 3.7, 5.1, 9]) {
      for (const count of [1, 2, 3, 4]) {
        expect(planBeatShots(scenes(count), targetS).slotS).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("holds a single shot when that is all the beat has", () => {
    const plan = planBeatShots(scenes(1), 7);
    expect(plan.shotCount).toBe(1);
    expect(plan.slotS).toBe(7);
  });

  it("always fills the beat exactly", () => {
    // The shots have to add up to the beat, or the narration track and the
    // picture drift apart.
    for (const targetS of [1.2, 3, 4.4, 6.8]) {
      const plan = planBeatShots(scenes(4), targetS);
      expect(plan.slotS * plan.shotCount).toBeCloseTo(targetS, 6);
    }
  });
});
