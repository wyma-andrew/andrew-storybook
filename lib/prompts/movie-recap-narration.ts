import { MOVIE_RECAP_LINE_CHARS, MOVIE_RECAP_LINE_MAX_CHARS } from "../constants/movie-recap";

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

// Nothing in this prompt differs per format any more: one script serves both
// aspect ratios, and the ratio decides only how many pieces it is cut into. The
// line budget is still the pacing control the model has — the line's length
// decides how long its beat holds the screen — it is simply the same budget
// either way. See MOVIE_RECAP_LINE_CHARS.
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
  `Keep every line to ONE idea, ${MOVIE_RECAP_LINE_CHARS[0]}-${MOVIE_RECAP_LINE_CHARS[1]} Burmese characters. ` +
  `Never write more than ${MOVIE_RECAP_LINE_MAX_CHARS}. ` +
  "Burmese runs at roughly 12-13 characters a second spoken, so that is what decides how long this beat holds the screen. " +
  "The line's length decides how long its beat stays on screen, so a rambling line makes the video drag. " +
  // Removed rather than re-costed: this used to quote the shot length and tell
  // the model how many seconds of speech a four-scene beat "wants", which is
  // exactly the per-clip coupling the narration must not have. A line carries
  // ONE idea and its length comes from that idea; the planner fits clips to the
  // line, never the other way round. The character budget above is NOT that
  // coupling coming back: it bounds the idea, not the clip, and the planner
  // still fits whatever the line turns out to be.
  "Pick the scenes that show this beat. Supplying more than the render can use is fine — it keeps the ones that fit " +
  "the line and drops the rest. Never lengthen a line to justify more scenes. " +
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
          // Which of the frames shown for this scene carries the moment the
          // description is about, 0-based. The shot planner plays the part of
          // the scene this frame came from, so it decides where the cut lands,
          // not just what the text says. With one frame it is always 0.
          peakFrame: { type: "integer", minimum: 0 },
        },
        required: ["sceneIndex", "visual", "peakFrame"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

// Several frames per scene changes what can be asked for: one still shows a
// moment, a sequence shows an EVENT. The wording below is deliberately about
// CHANGE — what is different by the last frame — because that is the part a
// transcript cannot supply and a recap is mostly made of.
//
// The "no names, no mood, no off-screen guessing" rules are unchanged and still
// carry their original reason: the narration model is the one that interprets,
// and a vision pass that speculates poisons it with invented plot.
export const movieRecapSceneVisionSystemPrompt =
  "You describe scenes from a film. Each scene is given to you as one or more frames in order, labelled with its scene index. " +
  "For each SCENE, write ONE English sentence covering only what is visible: who is present, where they are, and what happens. " +
  "When a scene has several frames they are moments from the same continuous shot, earliest first — so describe what CHANGES across them " +
  "(who moves, what they do, what appears or disappears), not each frame separately. Say 'a man in a flight suit walks to a jet and climbs in', " +
  "not 'a man stands. a man walks. a man sits.' When nothing changes, say what is there and that it holds. " +
  "Also return `peakFrame`: the 0-based index of the frame where the thing you described actually happens — the moment someone would " +
  "have to see for your sentence to make sense. Pick the frame that carries the action, not the setup or the aftermath. " +
  "Name no film, actor, or character — say 'a man in a flight suit', not a name. Do not interpret mood or plot, and do not guess at events off-screen. " +
  "Return one entry per scene, using that scene's index.";
