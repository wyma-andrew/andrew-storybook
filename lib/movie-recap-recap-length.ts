// Recap length grows with the square root of the source, not in proportion:
// recap channels run 5-12 minutes for a 2-hour film (~5-12%), while a short
// source needs a larger share or its events rush past. 1.1 * sqrt(minutes)
// gives ~28% at 15 min, ~22% at 25 min, ~14% at 1 h and ~10% at 2 h. Below
// ~13 minutes the curve climbs past 30% (53% at 4 min), which is no longer a
// recap, so it is capped there. See history/movie-recap.md.
const RECOMMENDED_FACTOR = 1.1;
const RECOMMENDED_MAX = 0.3;
export const RECAP_SHARE_PRESETS = [0.1, 0.15, 0.2, 0.25, 0.3] as const;
export const RECAP_SHARE_LIMITS = { min: 0.03, max: 0.6 } as const;
// A preset this close to the recommendation would be the same choice twice.
const DUPLICATE_GAP = 0.025;

export function recommendedRecapShare(sourceDurationS: number) {
  const minutes = sourceDurationS / 60;
  if (!(minutes > 0)) return 0.25;
  const share = (RECOMMENDED_FACTOR * Math.sqrt(minutes)) / minutes;
  return Math.round(Math.min(RECOMMENDED_MAX, Math.max(0.05, share)) * 100) / 100;
}

export function recapShareOptions(sourceDurationS: number) {
  const recommended = recommendedRecapShare(sourceDurationS);
  return [
    { share: recommended, recommended: true },
    ...RECAP_SHARE_PRESETS.filter((share) => Math.abs(share - recommended) >= DUPLICATE_GAP).map((share) => ({
      share,
      recommended: false,
    })),
  ].sort((a, b) => a.share - b.share);
}
