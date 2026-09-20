import { MOVIE_RECAP_NARRATION_RATE_FIT } from "./constants/movie-recap";

// Choosing ONE reading speed for a whole recap, so the finished narration is as
// long as the film it plays over.
//
// Applied to the video, never to a beat. Fitting each beat separately was built
// first and thrown out — it lands every number perfectly and sounds like a
// narrator who cannot settle. Kept pure so the clamp is testable without Azure.

/** Azure's SSML rate as a multiplier: "+15%" is 1.15, "-10%" is 0.9. */
export function parseRateFactor(rate: string | undefined) {
  if (!rate) return 1;
  const match = /^([+-]?\d+(?:\.\d+)?)%$/.exec(rate.trim());
  if (!match) return 1;
  return 1 + Number(match[1]) / 100;
}

/** The inverse, in whole percent — the precision Azure's own examples use. */
export function formatRateFactor(factor: number) {
  const percent = Math.round((factor - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export type NarrationRateFit = {
  /** The SSML rate to re-synthesize at, or null when the clip already fits. */
  rate: string | null;
  /** How much of the gap the clamp let it close, as a multiplier on the clip. */
  factor: number;
  /** Seconds the fitted clip is still expected to overrun its footage by. */
  residualS: number;
};

/**
 * How to re-read the narration so it lands on `targetS`.
 *
 * `measuredS` is the whole script as it came back at `baseRate`, and `targetS`
 * the footage there is to play it over. Duration moves inversely with the rate,
 * so the wanted multiplier is simply `measuredS / targetS` — clamped, because a
 * fit nobody can listen to is not a fit.
 */
export function fitNarrationRate({
  baseRate,
  measuredS,
  targetS,
}: {
  baseRate: string | undefined;
  measuredS: number;
  targetS: number;
}): NarrationRateFit {
  const { min, max, tolerance } = MOVIE_RECAP_NARRATION_RATE_FIT;
  if (!(measuredS > 0) || !(targetS > 0)) return { rate: null, factor: 1, residualS: 0 };

  const wanted = measuredS / targetS;
  const factor = Math.min(max, Math.max(min, wanted));
  const residualS = Math.max(0, measuredS / factor - targetS);
  if (Math.abs(factor - 1) <= tolerance) return { rate: null, factor: 1, residualS: Math.max(0, measuredS - targetS) };
  return { rate: formatRateFactor(parseRateFactor(baseRate) * factor), factor, residualS };
}
