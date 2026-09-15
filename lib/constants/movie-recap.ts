export const MOVIE_RECAP_LANGUAGES = [{ id: "my", name: "Burmese" }] as const;
export const MOVIE_RECAP_VOICES = [
  {
    id: "narrator",
    name: "Narrator",
    previewUrl: "/movie-recap/voices/narrator.mp3",
    sampleText: "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။",
  },
] as const;

export const MOVIE_RECAP_ASPECT_RATIOS = [
  { id: "9:16", name: "Vertical 9:16" },
  { id: "16:9", name: "Landscape 16:9" },
] as const;

export const MOVIE_RECAP_SUBTITLE_MODES = [
  { id: "none", name: "No Subtitles" },
  { id: "srt", name: "SRT file only" },
  { id: "styled", name: "Styled Subtitle" },
] as const;

export const MOVIE_RECAP_LOGO_PLACEMENTS = [
  { id: "top_left", name: "Top left" },
  { id: "top_right", name: "Top right" },
  { id: "bottom_left", name: "Bottom left" },
  { id: "bottom_right", name: "Bottom right" },
] as const;

export type MovieRecapLanguage = (typeof MOVIE_RECAP_LANGUAGES)[number]["id"];
export type MovieRecapVoiceId = (typeof MOVIE_RECAP_VOICES)[number]["id"];
export type MovieRecapAspectRatio = (typeof MOVIE_RECAP_ASPECT_RATIOS)[number]["id"];
export type MovieRecapSubtitleMode = (typeof MOVIE_RECAP_SUBTITLE_MODES)[number]["id"];
export type MovieRecapLogoPlacement = (typeof MOVIE_RECAP_LOGO_PLACEMENTS)[number]["id"];

export function isMovieRecapAspectRatio(value: unknown): value is MovieRecapAspectRatio {
  return MOVIE_RECAP_ASPECT_RATIOS.some((item) => item.id === value);
}

export function isMovieRecapSubtitleMode(value: unknown): value is MovieRecapSubtitleMode {
  return MOVIE_RECAP_SUBTITLE_MODES.some((item) => item.id === value);
}

export function isMovieRecapLogoPlacement(value: unknown): value is MovieRecapLogoPlacement {
  return MOVIE_RECAP_LOGO_PLACEMENTS.some((item) => item.id === value);
}
