import type { Region } from "../constants/regions";
import {
  styleContextBlock,
  outputLanguageBlock,
  regionAdaptationBlock,
  locationSpatialConsistencyBlock,
  identityAnchorBlock,
  stateLedgerBlock,
  screenDirectionBlock,
  motionDisciplineBlock,
  shotDistinctnessBlock,
} from "./shared";
import { DEFAULT_ASPECT_RATIO } from "../constants/aspect-ratios";

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
                beat: {
                  type: "string",
                  description:
                    "Why this shot exists, in one short line: the script line(s) it covers plus what it shows that the previous shot did not. " +
                    "e.g. 'ACTION: the man runs out — first movement out of the porch' or 'DIALOG line 2 — Nori's answer, her face for the first time'. " +
                    "If you cannot name something new, the shot should not exist as a separate shot.",
                },
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
                    "Start Frame: image prompt for this shot's opening moment, written against the attached character/location references (see assetsUsed). Cover the action, pose, expression, gaze, view-relative position in the space, and the framing — plus any visible change from the references the script calls for. " +
                    "Do not re-describe character appearance, wardrobe, or room layout that the attached references already show. No camera movement, lighting rig, art-style, or render-engine keywords — camera goes in the `camera` field, and style is injected separately by the app.",
                },
                videoPrompt: {
                  type: "string",
                  description:
                    "Google Flow (image-to-video) motion prompt: the action/movement originating from the Start Frame. " +
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
                      kind: { type: "string", enum: ["character", "location", "prop"] },
                    },
                    required: ["name", "kind"],
                    additionalProperties: false,
                  },
                },
                startState: {
                  type: "string",
                  description:
                    "Continuity ledger line for this shot's OPENING state — compact factual clauses, not prose: wardrobe state, objects held (and in which hand), where objects have been placed, and the character's position relative to a NAMED anchor from the location's FIXED LAYOUT. e.g. 'jacket zipped, backpack on left shoulder, phone in right hand, standing south of the oak table'. Must equal the previous shot's endState unless the script explicitly changes something.",
                },
                endState: {
                  type: "string",
                  description:
                    "Continuity ledger line for this shot's CLOSING state, same format as startState. Equals startState when the shot's action changes nothing physical (a reaction shot, a line of dialogue with no movement). Becomes the next shot's startState.",
                },
              },
              required: [
                "label",
                "beat",
                "durationS",
                "aspect",
                "camera",
                "prompt",
                "videoPrompt",
                "assetsUsed",
                "startState",
                "endState",
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

export function storyboardSystemPrompt(
  styleContext?: string | null,
  aspectRatio: string = DEFAULT_ASPECT_RATIO,
  region: Region = "english"
) {
  return (
    "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a copyable image generation prompt, plus a Google Flow (image-to-video) prompt. " +
    "Each shot's image is generated with that shot's character, location, and prop REFERENCE IMAGES attached, and those images carry the appearance. The prompt's job is to say what is different about this shot — the action, pose, expression, position in the space, and framing — not to re-describe what the references already show. " +
    "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...) — start a new scene at each one, [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [VOICE_OVER] (anonymous narration), [TRANSITION]. Use these tags as ground truth for structure.\n\n" +
    "VOICE OVER: use each [VOICE_OVER] block to choose meaningful visual coverage, and make the covered shots' combined duration long enough for natural narration. Create at least one distinct visual shot per Voice Over block so a later pass can assign non-overlapping ranges. Voice Over has no visible speaker: never invent a narrator character, lip movement, or speaking action from it, and never copy Voice Over text into a shot's videoPrompt. The narration is produced as a separate overlay track after the shots are generated. A shot beat may cite the relevant VOICE_OVER block.\n\n" +
    `Aspect Ratio & Visual Composition: this chapter's fixed aspect ratio is '${aspectRatio}' — set every shot's \`aspect\` to exactly this value, no exceptions. Compose every shot's \`prompt\` for this ratio, don't just label it:\n` +
    "- 9:16 (Vertical): frame subjects vertically — tight side margins, vertical/stacked composition (top-to-bottom motion, tall environments). Prioritize Medium Shots, Close-ups, Medium Close-ups, and vertical tilts/pan-ups; avoid Wide or Extreme Wide shots where the subject gets lost in the narrow horizontal frame. Do NOT include wide-horizontal composition language (e.g. 'wide panoramic view', 'expansive horizon line', 'sweeping landscape framing').\n" +
    "- 16:9 (Widescreen): frame subjects horizontally using the Rule of Thirds — emphasize depth, background context, and horizontal scale. Prioritize Wide Shots, Extreme Wide Shots, Establishing Shots, and horizontal tracking shots to maximize environmental detail. Do NOT include constrained-vertical composition language (e.g. 'tight vertical crop', 'tall narrow framing').\n\n" +
    "Establishing Master Shot: the FIRST shot in each new location must establish that space before any closer coverage of it — close shots hide spatial information, wide shots establish spatial truth, and every later shot in that location is generated against the layout this shot sets. Its `prompt` must show at least two named anchors from that location's FIXED LAYOUT and make their relative positions readable, and it must pin every character present left-to-right on screen (see SCREEN DIRECTION below) — a master shot that fixes the room but not the people leaves the next shot free to invent their order. " +
    "For 16:9 this is a true Wide or Establishing Shot. For 9:16 the vertical rules above still win — do NOT force a wide: use the widest ratio-appropriate framing instead (a wide medium or a vertical tilt revealing the space), still showing at least two named layout anchors. " +
    "Returning to a location later in the script does not need a new establishing shot unless its state has visibly changed.\n\n" +
    "Camera Variety: within the ratio-appropriate shot types above, do not repeat the same flat angle back-to-back across shots in a scene — vary coverage the way a real shot list does. When a shot continues a conversation or beat already established earlier in the scene, prefer 'Over-the-shoulder shot', 'Reaction shot', 'Panning shot', or a distinct new angle (still within the ratio's favored shot types) over repeating the previous shot's framing verbatim — this also hides small continuity drift between separately-generated shot images, since a deliberate angle change reads as a cut, not an error.\n\n" +
    "Video Prompt: describes motion only — the image it animates is the Start Frame, generated separately from this shot's `prompt`.\n" +
    "If a shot depicts a character speaking (has an adjacent [CHARACTER]/[DIALOG] pair in the script), the videoPrompt must quote that line verbatim with a language tag matching the language it's actually written in, e.g. `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"`. If a single line of dialogue is long enough that speaking it naturally would need more than ~6-8 seconds, do NOT stretch one shot's duration to cover the whole line — split it into multiple shorter shots instead (e.g. cut to a reaction/listener shot partway through, or a new angle on the same speaker), each carrying only the portion of the line spoken during that shot. Splitting on cuts is the standard approach for AI-generated dialogue scenes — short, reliable clips edited together beat one long single-take generation.\n" +
    "videoPrompt safety: AI video generators (e.g. Google Flow/Veo) run a separate IP/third-party-content filter that can block a prompt for describing a character with too many specific, iconic, signature-move-style gestures stacked in one action beat — this is especially likely for animal characters in speed/rivalry/competition contexts (a common trigger pattern resembles famous cartoon mascot behavior). Keep action description grounded in the scene's actual beat (what the script says happens) rather than piling on extra flourish gestures not needed to convey the action.\n\n" +
    "durationS is the recommended clip length for AI video generation — NEVER exceed 10 seconds, most AI video tools cannot export longer clips. Pick a realistic shorter duration (e.g. 2-6s) unless the action genuinely needs the full 10s.\n\n" +
    "ASSETS MATCHING:\n" +
    "- You are provided with a list of Known Assets (characters, locations, and/or props, given below) — this tells the user which reference images/prompts to attach when generating.\n" +
    "- When generating a shot's `prompt`, check which Known Assets appear in your text description.\n" +
    "- Every asset mentioned or depicted MUST be strictly listed in the assetsUsed array by its exact name. Cross-check before finalizing. Only include assets truly present in the shot's content, not every asset in the scene." +
    identityAnchorBlock() +
    locationSpatialConsistencyBlock() +
    screenDirectionBlock() +
    stateLedgerBlock() +
    shotDistinctnessBlock() +
    motionDisciplineBlock() +
    styleContextBlock(styleContext) +
    regionAdaptationBlock(region) +
    outputLanguageBlock()
  );
}
