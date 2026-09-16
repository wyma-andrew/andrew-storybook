export const MOVIE_RECAP_NARRATION_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // The detected scenes this narration line plays over, in the order
          // they should be cut. The render maps each back to that scene's real
          // start/end, so the model never invents timestamps and every cut lands
          // on a real one. Several scenes per line is the normal case — the
          // picture cuts between them while the line is spoken.
          sceneIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
          text: { type: "string" },
        },
        required: ["sceneIndexes", "text"],
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
  "Group the scenes that carry the plot into beats, and write ONE recap line per beat. " +
  "A beat is 2-4 scenes that belong together — the picture cuts between them while your line is spoken, the way a real recap does. " +
  "Within a beat, pick scenes that LOOK different from each other: a new subject, a new place, or a clearly different framing. " +
  "Two near-identical shots of the same person at almost the same angle read as a glitch rather than an edit, so prefer the scene " +
  "that shows something new over the one that merely continues the same image. " +
  "Use one scene alone only when it genuinely stands by itself. Keep scenes within a beat in the order they happen, " +
  "and keep the beats in ascending order. Skip scenes that add nothing; you do not have to cover every scene, but the beats " +
  "together must tell the whole story from beginning to end. Never use the same scene twice, in the same beat or a different one. " +
  "Keep every line very short — one idea, 25-45 Burmese characters. Never write more than 50; a 60-character line " +
  "takes about four seconds to speak, which is a whole beat on one thought. " +
  "The line's length decides how long its beat stays on screen, so a rambling line makes the video drag. " +
  "A beat is cut into roughly 1.5-second shots, so a line spoken over four scenes wants about six seconds of speech — " +
  "if a line is too short to give each of its scenes that long, the render drops the extra scenes. " +
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
