import { styleContextBlock, myanmarAdaptationBlock, locationSpatialConsistencyBlock } from "./shared";
import { DEFAULT_ASPECT_RATIO } from "@/lib/constants/aspect-ratios";

export const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          slug: { type: "string", description: "e.g. 'INT. LIGHTHOUSE — NIGHT'" },
          shots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "e.g. 'Establishing · Wide'" },
                durationS: {
                  type: "integer",
                  minimum: 1,
                  maximum: 10,
                  description:
                    "Recommended clip duration in seconds for AI video generation (Google Flow etc). Hard cap at 10 — most AI video tools cannot export clips longer than 10s.",
                },
                aspect: {
                  type: "string",
                  description: "Always set to this chapter's fixed aspect ratio, given below. Same value for every shot.",
                },
                camera: { type: "string", description: "e.g. 'static', 'slow push-in'" },
                prompt: {
                  type: "string",
                  description:
                    "Start Frame: full self-contained image generation prompt for this shot's opening state, content and composition only. No camera movement, lighting rig, art-style, or render-engine keywords — camera goes in the `camera` field, and style is injected separately by the app.",
                },
                frameMode: {
                  type: "string",
                  enum: ["start_frame_only", "start_and_end_frame"],
                  description:
                    "'start_and_end_frame' when this shot's motion flows seamlessly into the next shot (same scene/angle, continuous action) — 'start_frame_only' when the next shot is a hard cut, angle change, or new location.",
                },
                endFramePrompt: {
                  type: ["string", "null"],
                  description:
                    "Required (non-null) when frameMode is 'start_and_end_frame': a full self-contained image prompt matching this shot's closing state, which equals the NEXT shot's Start Frame. Null when frameMode is 'start_frame_only'.",
                },
                videoPrompt: {
                  type: "string",
                  description:
                    "Google Flow (image-to-video) motion prompt. For 'start_and_end_frame', describe the camera/subject motion bridging Start Frame to End Frame. For 'start_frame_only', describe the isolated action/movement originating from the Start Frame. " +
                    "If this shot depicts a character speaking, include the line verbatim, language-tagged: `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"` (detect the language from the script) — matching the actual language the dialog is written in.",
                },
                assetsUsed: {
                  type: "array",
                  description:
                    "Which of the Known Assets (given below) actually appear in this shot and should be attached as reference images/prompts when generating it. Use the exact name from Known Assets. Empty array if none apply.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "exact name from Known Assets" },
                      kind: { type: "string", enum: ["character", "location"] },
                    },
                    required: ["name", "kind"],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "label",
                "durationS",
                "aspect",
                "camera",
                "prompt",
                "frameMode",
                "endFramePrompt",
                "videoPrompt",
                "assetsUsed",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "slug", "shots"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

export function storyboardSystemPrompt(styleContext?: string | null, aspectRatio: string = DEFAULT_ASPECT_RATIO) {
  return (
    "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a full, self-contained, copyable image generation prompt that folds in the given character/location identity descriptions, plus a Google Flow (image-to-video) prompt. " +
    "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...) — start a new scene at each one, [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure.\n\n" +
    `Aspect Ratio & Visual Composition: this chapter's fixed aspect ratio is '${aspectRatio}' — set every shot's \`aspect\` to exactly this value, no exceptions. Compose every shot's \`prompt\`/\`endFramePrompt\` for this ratio, don't just label it:\n` +
    "- 9:16 (Vertical): frame subjects vertically — tight side margins, vertical/stacked composition (top-to-bottom motion, tall environments). Prioritize Medium Shots, Close-ups, Medium Close-ups, and vertical tilts/pan-ups; avoid Wide or Extreme Wide shots where the subject gets lost in the narrow horizontal frame. Do NOT include wide-horizontal composition language (e.g. 'wide panoramic view', 'expansive horizon line', 'sweeping landscape framing').\n" +
    "- 16:9 (Widescreen): frame subjects horizontally using the Rule of Thirds — emphasize depth, background context, and horizontal scale. Prioritize Wide Shots, Extreme Wide Shots, Establishing Shots, and horizontal tracking shots to maximize environmental detail. Do NOT include constrained-vertical composition language (e.g. 'tight vertical crop', 'tall narrow framing').\n\n" +
    "Camera Variety: within the ratio-appropriate shot types above, do not repeat the same flat angle back-to-back across shots in a scene — vary coverage the way a real shot list does. When a shot continues a conversation or beat already established earlier in the scene, prefer 'Over-the-shoulder shot', 'Reaction shot', 'Panning shot', or a distinct new angle (still within the ratio's favored shot types) over repeating the previous shot's framing verbatim — this also hides small continuity drift between separately-generated shot images, since a deliberate angle change reads as a cut, not an error.\n\n" +
    "Video Generation Strategy (Start & End Frame Interpolation): for every shot, decide frameMode by checking continuity with the NEXT shot. Default to 'start_frame_only' — most shot-to-shot transitions in a script are cuts (new angle, new beat, new speaker, new action), not continuous motion. Only use 'start_and_end_frame' when you can point to a specific, concrete reason the two shots are the SAME uninterrupted camera move (identical camera position/angle and framing, same subject, action physically continuing frame-to-frame with no cut). If in doubt, use 'start_frame_only'.\n" +
    "1. 'start_and_end_frame' (same uninterrupted camera move into the next shot): set endFramePrompt to an image prompt matching the opening state of the NEXT shot (i.e. this shot's End Frame IS the next shot's Start Frame — repeat that next shot's Start Frame prompt here verbatim so this shot stays self-contained). videoPrompt should focus on the camera motion, subject movement, and transition bridging Start Frame to End Frame.\n" +
    "2. 'start_frame_only' (cut, angle change, new beat, new location, or default when unsure): endFramePrompt = null. videoPrompt should focus purely on the isolated action/movement originating from the Start Frame — do not force an End Frame.\n" +
    "If a shot depicts a character speaking (has an adjacent [CHARACTER]/[DIALOG] pair in the script), the videoPrompt must quote that line verbatim with a language tag matching the language it's actually written in, e.g. `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"`. If a single line of dialogue is long enough that speaking it naturally would need more than ~6-8 seconds, do NOT stretch one shot's duration to cover the whole line — split it into multiple shorter shots instead (e.g. cut to a reaction/listener shot partway through, or a new angle on the same speaker), each carrying only the portion of the line spoken during that shot. Splitting on cuts is the standard approach for AI-generated dialogue scenes — short, reliable clips edited together beat one long single-take generation.\n" +
    "videoPrompt safety: AI video generators (e.g. Google Flow/Veo) run a separate IP/third-party-content filter that can block a prompt for describing a character with too many specific, iconic, signature-move-style gestures stacked in one action beat — this is especially likely for animal characters in speed/rivalry/competition contexts (a common trigger pattern resembles famous cartoon mascot behavior). Keep action description grounded in the scene's actual beat (what the script says happens) rather than piling on extra flourish gestures not needed to convey the action.\n\n" +
    "durationS is the recommended clip length for AI video generation — NEVER exceed 10 seconds, most AI video tools cannot export longer clips. Pick a realistic shorter duration (e.g. 2-6s) unless the action genuinely needs the full 10s.\n\n" +
    "ASSETS MATCHING:\n" +
    "- You are provided with a list of Known Assets (characters and/or locations, given below) — this tells the user which reference images/prompts to attach when generating.\n" +
    "- When generating `prompt` or `endFramePrompt`, check which Known Assets appear in your text description.\n" +
    "- Every asset mentioned or depicted MUST be strictly listed in the assetsUsed array by its exact name. Cross-check before finalizing. Only include assets truly present in the shot's content, not every asset in the scene." +
    locationSpatialConsistencyBlock() +
    styleContextBlock(styleContext)
  );
}

// Myanmar-region variant — separate function so the English flow above
// stays untouched while this is iterated on independently. Shots reference
// characters/locations in action, so the adaptation must apply here too or
// storyboard shots would drift back to generic against a correctly-adapted
// asset sheet.
export function storyboardSystemPromptMyanmar(styleContext?: string | null, aspectRatio: string = DEFAULT_ASPECT_RATIO) {
  return (
    "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a full, self-contained, copyable image generation prompt that folds in the given character/location identity descriptions, plus a Google Flow (image-to-video) prompt. " +
    "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...) — start a new scene at each one, [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure.\n\n" +
    `Aspect Ratio & Visual Composition: this chapter's fixed aspect ratio is '${aspectRatio}' — set every shot's \`aspect\` to exactly this value, no exceptions. Compose every shot's \`prompt\`/\`endFramePrompt\` for this ratio, don't just label it:\n` +
    "- 9:16 (Vertical): frame subjects vertically — tight side margins, vertical/stacked composition (top-to-bottom motion, tall environments). Prioritize Medium Shots, Close-ups, Medium Close-ups, and vertical tilts/pan-ups; avoid Wide or Extreme Wide shots where the subject gets lost in the narrow horizontal frame. Do NOT include wide-horizontal composition language (e.g. 'wide panoramic view', 'expansive horizon line', 'sweeping landscape framing').\n" +
    "- 16:9 (Widescreen): frame subjects horizontally using the Rule of Thirds — emphasize depth, background context, and horizontal scale. Prioritize Wide Shots, Extreme Wide Shots, Establishing Shots, and horizontal tracking shots to maximize environmental detail. Do NOT include constrained-vertical composition language (e.g. 'tight vertical crop', 'tall narrow framing').\n\n" +
    "Camera Variety: within the ratio-appropriate shot types above, do not repeat the same flat angle back-to-back across shots in a scene — vary coverage the way a real shot list does. When a shot continues a conversation or beat already established earlier in the scene, prefer 'Over-the-shoulder shot', 'Reaction shot', 'Panning shot', or a distinct new angle (still within the ratio's favored shot types) over repeating the previous shot's framing verbatim — this also hides small continuity drift between separately-generated shot images, since a deliberate angle change reads as a cut, not an error.\n\n" +
    "Video Generation Strategy (Start & End Frame Interpolation): for every shot, decide frameMode by checking continuity with the NEXT shot. Default to 'start_frame_only' — most shot-to-shot transitions in a script are cuts (new angle, new beat, new speaker, new action), not continuous motion. Only use 'start_and_end_frame' when you can point to a specific, concrete reason the two shots are the SAME uninterrupted camera move (identical camera position/angle and framing, same subject, action physically continuing frame-to-frame with no cut). If in doubt, use 'start_frame_only'.\n" +
    "1. 'start_and_end_frame' (same uninterrupted camera move into the next shot): set endFramePrompt to an image prompt matching the opening state of the NEXT shot (i.e. this shot's End Frame IS the next shot's Start Frame — repeat that next shot's Start Frame prompt here verbatim so this shot stays self-contained). videoPrompt should focus on the camera motion, subject movement, and transition bridging Start Frame to End Frame.\n" +
    "2. 'start_frame_only' (cut, angle change, new beat, new location, or default when unsure): endFramePrompt = null. videoPrompt should focus purely on the isolated action/movement originating from the Start Frame — do not force an End Frame.\n" +
    "If a shot depicts a character speaking (has an adjacent [CHARACTER]/[DIALOG] pair in the script), the videoPrompt must quote that line verbatim with a language tag matching the language it's actually written in, e.g. `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"`. If a single line of dialogue is long enough that speaking it naturally would need more than ~6-8 seconds, do NOT stretch one shot's duration to cover the whole line — split it into multiple shorter shots instead (e.g. cut to a reaction/listener shot partway through, or a new angle on the same speaker), each carrying only the portion of the line spoken during that shot. Splitting on cuts is the standard approach for AI-generated dialogue scenes — short, reliable clips edited together beat one long single-take generation.\n" +
    "videoPrompt safety: AI video generators (e.g. Google Flow/Veo) run a separate IP/third-party-content filter that can block a prompt for describing a character with too many specific, iconic, signature-move-style gestures stacked in one action beat — this is especially likely for animal characters in speed/rivalry/competition contexts (a common trigger pattern resembles famous cartoon mascot behavior). Keep action description grounded in the scene's actual beat (what the script says happens) rather than piling on extra flourish gestures not needed to convey the action.\n\n" +
    "durationS is the recommended clip length for AI video generation — NEVER exceed 10 seconds, most AI video tools cannot export longer clips. Pick a realistic shorter duration (e.g. 2-6s) unless the action genuinely needs the full 10s.\n\n" +
    "ASSETS MATCHING:\n" +
    "- You are provided with a list of Known Assets (characters and/or locations, given below) — this tells the user which reference images/prompts to attach when generating.\n" +
    "- When generating `prompt` or `endFramePrompt`, check which Known Assets appear in your text description.\n" +
    "- Every asset mentioned or depicted MUST be strictly listed in the assetsUsed array by its exact name. Cross-check before finalizing. Only include assets truly present in the shot's content, not every asset in the scene." +
    locationSpatialConsistencyBlock() +
    styleContextBlock(styleContext) +
    myanmarAdaptationBlock()
  );
}
