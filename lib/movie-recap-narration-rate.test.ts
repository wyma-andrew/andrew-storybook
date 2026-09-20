import { describe, expect, it } from "vitest";
import { fitNarrationRate, formatRateFactor, parseRateFactor } from "./movie-recap-narration-rate";
import { MOVIE_RECAP_NARRATION_RATE_FIT } from "./constants/movie-recap";

describe("parseRateFactor", () => {
  it("reads Azure's own spelling", () => {
    expect(parseRateFactor("+15%")).toBeCloseTo(1.15, 6);
    expect(parseRateFactor("-10%")).toBeCloseTo(0.9, 6);
  });

  it("treats anything it cannot read as the voice's default", () => {
    // A voice with no rate, or a rate written some other way, must not silently
    // become a 100% speed change.
    expect(parseRateFactor(undefined)).toBe(1);
    expect(parseRateFactor("fast")).toBe(1);
  });

  it("round-trips through formatRateFactor", () => {
    expect(formatRateFactor(parseRateFactor("+15%"))).toBe("+15%");
    expect(formatRateFactor(1)).toBe("+0%");
  });
});

describe("fitNarrationRate", () => {
  it("speeds a long script up onto its footage", () => {
    // 26.2s of speech over 24s of film: read it 1.09x faster.
    const fit = fitNarrationRate({ baseRate: "+15%", measuredS: 26.2, targetS: 24 });
    expect(fit.factor).toBeCloseTo(1.092, 2);
    expect(fit.rate).toBe("+26%");
    expect(fit.residualS).toBeCloseTo(0, 6);
  });

  it("slows a short script down to fill its footage", () => {
    const fit = fitNarrationRate({ baseRate: "+15%", measuredS: 22.4, targetS: 24.2 });
    expect(fit.factor).toBeLessThan(1);
    expect(fit.rate).toBe("+6%");
  });

  it("leaves the script alone when it is already close enough", () => {
    // Re-synthesizing every beat to move the video 1% is spend for nothing.
    const fit = fitNarrationRate({ baseRate: "+15%", measuredS: 24.3, targetS: 24 });
    expect(fit.rate).toBeNull();
  });

  it("refuses to read faster than a person can follow, and reports the leftover", () => {
    // A real export: 184.5s of Burmese over a 170.2s film would fit at 1.08, but
    // a script half again too long would not. The clamp holds, the recap simply
    // runs past its source, and the Transcript step names the block
    // (history/movie-recap.md, 2026-09-19).
    const fit = fitNarrationRate({ baseRate: "+15%", measuredS: 39.4, targetS: 27 });
    expect(fit.factor).toBe(MOVIE_RECAP_NARRATION_RATE_FIT.max);
    expect(fit.residualS).toBeCloseTo(39.4 / 1.15 - 27, 3);
  });

  it("never returns a rate outside the band", () => {
    for (const measuredS of [5, 20, 60, 120]) {
      const { factor } = fitNarrationRate({ baseRate: "+15%", measuredS, targetS: 24 });
      expect(factor).toBeGreaterThanOrEqual(MOVIE_RECAP_NARRATION_RATE_FIT.min);
      expect(factor).toBeLessThanOrEqual(MOVIE_RECAP_NARRATION_RATE_FIT.max);
    }
  });

  it("does nothing without a real measurement", () => {
    expect(fitNarrationRate({ baseRate: "+15%", measuredS: 0, targetS: 24 }).rate).toBeNull();
  });
});
