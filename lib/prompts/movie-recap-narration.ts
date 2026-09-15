export const MOVIE_RECAP_NARRATION_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceStartS: { type: "number", minimum: 0 },
          sourceEndS: { type: "number", minimum: 0 },
          text: { type: "string" },
        },
        required: ["sourceStartS", "sourceEndS", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
} as const;

export const movieRecapNarrationSystemPrompt =
  "You write a Burmese-language movie recap narration script from a timestamped dialogue transcript of the source video. " +
  "Condense the plot into third-person recap narration — do not quote dialogue verbatim, summarize what happens. " +
  "Cover the full timeline from 0 to the video's end with contiguous, non-overlapping segments in order. " +
  "Each segment's sourceStartS/sourceEndS is the portion of the ORIGINAL video its narration line covers — segments may merge several transcript lines or split a long one, " +
  "but every segment must be long enough (at least 2 seconds) to be a real recap beat, not a one-word fragment. " +
  "Write every `text` value in Burmese.";
