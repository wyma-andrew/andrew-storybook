import type { MovieRecapProject } from "./api/types";
import {
  MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
  MOVIE_RECAP_TARGET_FPS,
} from "./constants/movie-recap";

export function normalizeMovieRecapNarrationManifest(
  value: MovieRecapProject["renderScript"]
): MovieRecapProject["renderScript"] {
  if (!value) return null;
  return value.map((beat) => {
    const savedRate = beat.narrationRate;
    const rawAudioS = beat.rawAudioS ?? (
      beat.audioS && savedRate ? beat.audioS * savedRate : undefined
    );
    if (!rawAudioS) return beat;
    return {
      ...beat,
      rawAudioS,
      audioS: Math.ceil((rawAudioS / MOVIE_RECAP_NARRATION_PLAYBACK_RATE) * MOVIE_RECAP_TARGET_FPS) / MOVIE_RECAP_TARGET_FPS,
      narrationRate: MOVIE_RECAP_NARRATION_PLAYBACK_RATE,
    };
  });
}
