export const MOVIE_RECAP_NARRATION_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // Which detected scene this narration line covers. The render maps it
          // back to that scene's real start/end, so the model never invents
          // timestamps and every clip lands on a real cut.
          sceneIndex: { type: "integer", minimum: 0 },
          text: { type: "string" },
        },
        required: ["sceneIndex", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
} as const;

export const movieRecapNarrationSystemPrompt =
  "You write a Burmese-language movie recap narration script. " +
  "You are given the source video broken into detected scenes. Each scene has an index, its start and end time, " +
  "a one-line description of what is visible in it, and any spoken dialogue transcribed from it (dialogue may be empty — " +
  "action scenes often have none, and the visual description is all you get for those). " +
  "Select the scenes that carry the plot and write one recap line per selected scene, in ascending scene order. " +
  "Skip scenes that add nothing; you do not have to cover every scene, but the selected scenes together must tell the whole story " +
  "from beginning to end. Never use the same scene twice. " +
  "Keep every line very short — one idea, ideally 25-45 Burmese characters, never more than 60. " +
  "The line's length decides how long its clip stays on screen, so a rambling line makes the video drag. " +
  "Condense the plot into third-person recap narration — do not quote dialogue verbatim, summarize what happens, " +
  "and use the visual description to describe action the dialogue does not explain. " +
  // Deliberately a role, not a grammar checklist. An earlier version listed the
  // permitted spoken endings and banned the literary ones; tested side by side,
  // this wording holds the spoken register just as well and leaves the phrasing
  // to the model. (Every line ending in တယ် is unrelated — output is the same
  // with or without an ending list.) If literary forms (သည်၊ ၏၊ များ၊ သော) ever
  // come back, the checklist is in git history.
  "You are a Burmese recap narrator on YouTube, talking to your viewers. " +
  "Write each line in Burmese the way you would actually say it out loud to someone, not the way it would be written in a book or a news report.";

export const MOVIE_RECAP_SCENE_VISION_SCHEMA = {
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
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

export const movieRecapSceneVisionSystemPrompt =
  "You describe frames taken from a film, one representative frame per scene. " +
  "For each image, write ONE short English sentence covering only what is visible: who is present, where they are, and what is happening. " +
  "Name no film, actor, or character — say 'a man in a flight suit', not a name. Do not interpret mood or plot, and do not guess at events off-screen. " +
  "Each image is labelled with its scene index; return one entry per image using that same index.";
