import type { MovieRecapNarrationSegment } from "./api/types";

export type BeatTiming = { beat: number; startS: number; endS: number; durationS: number };

export function selectMovieRecapBeatRange(
  narration: MovieRecapNarrationSegment[],
  timings: BeatTiming[],
  startBeat: number,
  endBeat: number
) {
  if (!Number.isSafeInteger(startBeat) || !Number.isSafeInteger(endBeat) ||
      startBeat < 1 || endBeat < startBeat || endBeat > narration.length || timings.length !== narration.length) {
    throw new Error("The selected beat range is no longer available.");
  }
  const startS = timings[startBeat - 1].startS;
  const endS = timings[endBeat - 1].endS;
  return {
    narration: narration.slice(startBeat - 1, endBeat),
    timings: timings.slice(startBeat - 1, endBeat).map((timing, index) => ({
      ...timing,
      beat: startBeat + index,
      startS: timing.startS - startS,
      endS: timing.endS - startS,
    })),
    startS,
    endS,
  };
}
