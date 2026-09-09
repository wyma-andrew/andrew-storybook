export const VOICE_OVER_ASSIGNMENT_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceIndex: { type: "integer", minimum: 1 },
          startSceneIndex: { type: "integer", minimum: 1 },
          startShotIndex: { type: "integer", minimum: 1 },
          endSceneIndex: { type: "integer", minimum: 1 },
          endShotIndex: { type: "integer", minimum: 1 },
        },
        required: ["sourceIndex", "startSceneIndex", "startShotIndex", "endSceneIndex", "endShotIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
} as const;

export const voiceOverAssignmentSystemPrompt =
  "You map anonymous Voice Over narration onto an already-finalized storyboard. " +
  "Return every narration source exactly once, in sourceIndex order. Assign each source a contiguous inclusive start/end shot range. " +
  "Ranges may cross scenes and may have gaps between them, but they must never overlap or run backwards. " +
  "Use the shot beats to match meaning and the summed shot durations to leave enough time for the narration to be spoken naturally. " +
  "Do not rewrite, translate, split, or quote the narration; return only source indexes and shot coordinates.";
