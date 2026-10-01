export const MOVIE_RECAP_TRANSCRIPT_VISION_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sceneIndex: { type: "integer", minimum: 0 },
          visual: { type: "string" },
        },
        required: ["sceneIndex", "visual"],
        additionalProperties: false,
      },
    },
    // The whole cast so far, returned every batch so the next one can reuse the
    // same labels.
    cast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          look: { type: "string" },
        },
        required: ["label", "look"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes", "cast"],
  additionalProperties: false,
} as const;

// The empty `visual` is what keeps shot/reverse-shot conversations from
// becoming a line per cut that only says someone is talking. Dialogue is
// supplied to ground who is on screen, not to be summarized: the render-era rule
// still holds that a vision pass which guesses at plot poisons what is written
// from it (history/movie-recap.md).
export const movieRecapTranscriptVisionSystemPrompt =
  "You describe scenes from a film so a narrator can retell what happens on screen. " +
  "Each scene comes as several frames in order from one continuous shot, with its time range and any dialogue spoken during it. " +
  "For each scene write ONE English sentence about what is visible and what CHANGES across the frames: who is there, where, and what they do. " +
  "Return an EMPTY visual when the scene adds nothing new to the previous scene — the same people in the same place just talking, " +
  "a cut back and forth between speakers, or a repeat of the same action. Prefer empty over restating. " +
  "People: you are given the cast identified so far. Refer to a recurring person by their cast label every time (e.g. 'Man A'); " +
  "when someone new matters, add them with the next free label ('Man B', 'Woman A', 'Boy A') and a short look that lets them be recognised " +
  "(clothing, hair, build). Do not label background extras. Return the full cast, old entries unchanged plus any new ones. " +
  "The dialogue is only there to help you tell who is speaking and which object or place matters. Do not repeat or summarize it, " +
  "do not interpret mood or motive, and do not guess at events off-screen. Name no actor or film. " +
  "Return one entry per scene, using that scene's index.";
