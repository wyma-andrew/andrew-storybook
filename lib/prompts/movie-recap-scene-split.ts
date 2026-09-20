export const MOVIE_RECAP_SCENE_SPLIT_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // Index into the scenes given, in order. Every scene gets exactly one
          // part; a scene whose share of the passage is nothing gets an empty
          // string rather than being left out, so the render can still map
          // part to scene by position.
          sceneIndex: { type: "integer", minimum: 0 },
          text: { type: "string" },
        },
        required: ["sceneIndex", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["parts"],
  additionalProperties: false,
} as const;

// Dividing ONE passage of the user's own Burmese across the scenes it plays
// over. This model never writes narration and never translates — every
// character it returns came from the passage it was given.
//
// Why a model rather than a proportional split: the cut lands where the part
// ends, so a mechanical split cuts mid-clause and the picture changes in the
// middle of a thought. Which sentence belongs to which picture is a reading
// question, which is what this pass is for. See history/movie-recap.md,
// 2026-09-19.
export const movieRecapSceneSplitSystemPrompt =
  "You are given ONE passage of Burmese recap narration and the list of consecutive scenes it will be played over. " +
  "Each scene has an index, its length in seconds, and a one-line description of what is visible in it. " +
  "Split the passage across those scenes, in order.\n\n" +
  "RULES, in order of importance:\n" +
  "1. NEVER change a single character of the passage. Do not translate, rewrite, correct, shorten, summarize or add. " +
  "Concatenating your parts in order must reproduce the passage exactly, apart from the whitespace at the joins.\n" +
  "2. Keep the order. Part 1 is the beginning of the passage, the last part is its end.\n" +
  "3. Split at sentence ends (Burmese '။') where you can, and at a clause break ('၊') only when a sentence would " +
  "otherwise be far too long for its scene. Never split mid-clause.\n" +
  "4. Match MEANING to PICTURE. Put the sentences that describe what a scene shows on that scene. This matters more than " +
  "making the parts even.\n" +
  "5. Then respect length. A scene of N seconds can carry roughly 12 Burmese characters per second. Use that to choose " +
  "between two defensible split points, not to override rule 4.\n" +
  "6. Return one part per scene, in scene order. If the passage has fewer sentences than there are scenes, give the " +
  "scenes that carry nothing an empty string — never invent text to fill them, and never reuse a sentence.";
