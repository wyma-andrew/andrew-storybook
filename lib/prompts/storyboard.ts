import type { Region } from "../constants/regions";
import {
  styleContextBlock,
  outputLanguageBlock,
  regionAdaptationBlock,
  locationSpatialConsistencyBlock,
  identityAnchorBlock,
  ambientPopulationBlock,
  stateLedgerBlock,
  screenDirectionBlock,
  motionDisciplineBlock,
  shotDistinctnessBlock,
  motionStyleBlock,
  siteMapBlock,
  lightingBlock,
  shotScaleBlock,
  scriptFidelityBlock,
} from "./shared";
import { DEFAULT_ASPECT_RATIO } from "../constants/aspect-ratios";
import { joinPromptParts, nonEmptyParts, promptPart, type PromptPart } from "./parts";
import { coverageModeInstruction, type CoverageMode } from "../constants/coverage-modes";
import type { StoryFormat } from "../constants/story-formats";
import { cozyAsmrFormatBlock, SOUND_PROMPT_PROPERTY } from "./storyboard-asmr";

export const SITE_MAP_SCHEMA = {
  type: "object",
  properties: {
    places: {
      type: "array",
      description:
        "One entry per distinct PHYSICAL place the script visits — not one per scene heading. Headings that play in the same place share one entry.",
      items: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Exact name of the matching Known Assets location. Empty string only when the script visits a place that has no location asset.",
          },
          sceneSlugs: {
            type: "array",
            description: "Every [SCENE] heading that plays in this place, verbatim as written in the script, in script order.",
            items: { type: "string" },
          },
          note: {
            type: "string",
            description:
              "One short line on what happens here — never how it looks, which the location asset's realPrompt already carries.",
          },
          stations: {
            type: "array",
            description:
              "CAMERA STATIONS (see siteMapBlock): the camera positions this chapter's shots of this place use. The first is always key 'reference'. Empty array only when location is empty.",
            items: {
              type: "object",
              properties: {
                key: { type: "string", description: "'reference' for the first; otherwise a short lowercase ascii slug, unique within the place" },
                label: { type: "string", description: "1-4 English words naming the view" },
                view: {
                  type: "string",
                  description:
                    "Where the camera stands and which way it looks, named against fixed features of the location, then what sits at frame left, centre, frame right, and in the background from there, with how near or far each landmark is.",
                },
              },
              required: ["key", "label", "view"],
              additionalProperties: false,
            },
          },
        },
        required: ["location", "sceneSlugs", "note", "stations"],
        additionalProperties: false,
      },
    },
    connections: {
      type: "array",
      description:
        "One entry per move a character actually makes between two places in the script. Empty array when the chapter never leaves one place.",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "place left, named exactly as in places[].location" },
          to: { type: "string", description: "place arrived at, named exactly as in places[].location" },
          via: {
            type: "string",
            description:
              "The anchor the move passes through, taken from the FROM place's FIXED LAYOUT — e.g. 'main door, south wall', 'front stair'.",
          },
          screenDirection: {
            type: "string",
            description:
              "Travel direction against the places, never fixed frame sides — e.g. 'out through the town entrance onto the forest trail toward the deep forest'. Each shot derives its frame direction from its own station.",
          },
        },
        required: ["from", "to", "via", "screenDirection"],
        additionalProperties: false,
      },
    },
  },
  required: ["places", "connections"],
  additionalProperties: false,
} as const;

export const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    // Emitted before `scenes`: the chapter's geography is settled once, then
    // every scene is shot against it. See siteMapBlock in ./shared.
    siteMap: SITE_MAP_SCHEMA,
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          slug: { type: "string", description: "e.g. 'INT. LIGHTHOUSE — NIGHT'" },
          lighting: {
            type: "string",
            description:
              "One short line of scene lighting and atmosphere shared by every shot in this scene: the hour/light condition from the scene heading, where the light comes from (named against the location's FIXED LAYOUT anchors), and the mood. Scene content only — never a lighting rig, lens, exposure, or render wording. See SCENE LIGHTING below.",
          },
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
                shotScale: {
                  type: "string",
                  enum: ["wide", "medium", "close", "extreme-close"],
                  description:
                    "This shot's framing scale. The app composes a fixed optics line (depth of field, background treatment) from it at copy time — see SHOT SCALE below. It must agree with the framing the `prompt` opens with.",
                },
                prompt: {
                  type: "string",
                  description:
                    "Start Frame: image prompt for this shot's opening moment, written against the attached character/location references (see assetsUsed). " +
                    "OPEN WITH THE FRAMING AND THE SUBJECT, in that order — 'Wide establishing shot of the monastery courtyard...', 'Medium shot of Nori carrying a clay pot...', 'Extreme close-up of the alms bowl in her hands...' — then the action, pose, expression, gaze, and view-relative position in the space, then any visible change from the references the script calls for. " +
                    "Do not re-describe character appearance, wardrobe, or room layout that the attached references already show. No camera movement, lighting rig, art-style, or render-engine keywords — camera goes in the `camera` field, and style is injected separately by the app.",
                },
                videoPrompt: {
                  type: "string",
                  description:
                    "Google Flow (image-to-video) motion prompt: the action/movement originating from the Start Frame. " +
                    "If this shot depicts a character speaking, include the line verbatim, language-tagged: `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"` (detect the language from the script) — matching the actual language the dialog is written in.",
                },
                motionMode: {
                  type: "string",
                  enum: ["micro", "dialogue", "normal", "emotional"],
                  description:
                    "Which motion register this shot belongs to. The app builds the shot's motion instructions from a fixed template for this mode — see MOTION MODE below. Never write camera-movement or motion-intensity wording into videoPrompt yourself.",
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
                      look: {
                        type: "string",
                        description: "for a character listed with LOOKS in Known Assets: the key of the look this shot shows. Empty string for every other asset.",
                      },
                      station: {
                        type: "string",
                        description: "for a location: the key of the site-map station this shot's camera stands at. Empty string for characters and props.",
                      },
                    },
                    required: ["name", "kind", "look", "station"],
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
                "shotScale",
                "prompt",
                "videoPrompt",
                "motionMode",
                "assetsUsed",
                "startState",
                "endState",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "slug", "lighting", "shots"],
        additionalProperties: false,
      },
    },
  },
  required: ["siteMap", "scenes"],
  additionalProperties: false,
} as const;

// Cinematic stories get STORYBOARD_SCHEMA unchanged; only the ASMR format adds
// a required soundPrompt to every shot.
function withSoundPrompt<T extends { properties: object; required: readonly string[] }>(shot: T) {
  return {
    ...shot,
    properties: { ...shot.properties, soundPrompt: SOUND_PROMPT_PROPERTY },
    required: [...shot.required, "soundPrompt"],
  };
}

export function storyboardSchema(format: StoryFormat) {
  if (format !== "cozy-asmr") return STORYBOARD_SCHEMA;
  const scene = STORYBOARD_SCHEMA.properties.scenes.items;
  return {
    ...STORYBOARD_SCHEMA,
    properties: {
      ...STORYBOARD_SCHEMA.properties,
      scenes: {
        ...STORYBOARD_SCHEMA.properties.scenes,
        items: {
          ...scene,
          properties: {
            ...scene.properties,
            shots: { ...scene.properties.shots, items: withSoundPrompt(scene.properties.shots.items) },
          },
        },
      },
    },
  };
}

export function storyboardSystemPromptParts(
  styleContext?: string | null,
  aspectRatio: string = DEFAULT_ASPECT_RATIO,
  region: Region = "english",
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
): PromptPart[] {
  return nonEmptyParts([
    promptPart("role", "Role, references & script tags", "storyboard.ts", "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a copyable image generation prompt, plus a Google Flow (image-to-video) prompt. " +
      "Each shot's image is generated with that shot's character, location, and prop REFERENCE IMAGES attached, and those images carry the appearance. The prompt's job is to say what is different about this shot — the action, pose, expression, position in the space, and framing — not to re-describe what the references already show. " +
      "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...) — start a new scene at each one, [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [VOICE_OVER] (anonymous narration), [TRANSITION]. Use these tags as ground truth for structure.\n\n"),
    promptPart("voiceOver", "Voice Over", "storyboard.ts", "VOICE OVER: use each [VOICE_OVER] block to choose meaningful visual coverage, and make the covered shots' combined duration long enough for natural narration. Create at least one distinct visual shot per Voice Over block so a later pass can assign non-overlapping ranges. Voice Over has no visible speaker: never invent a narrator character, lip movement, or speaking action from it, and never copy Voice Over text into a shot's videoPrompt. The narration is produced as a separate overlay track after the shots are generated. A shot beat may cite the relevant VOICE_OVER block.\n\n"),
    promptPart("aspect", "Aspect ratio & composition", "storyboard.ts", `Aspect Ratio & Visual Composition: this chapter's fixed aspect ratio is '${aspectRatio}' — set every shot's \`aspect\` to exactly this value, no exceptions. Compose every shot's \`prompt\` for this ratio, don't just label it:\n` +
      "- 9:16 (Vertical): frame subjects vertically — tight side margins, vertical/stacked composition (top-to-bottom motion, tall environments). Prioritize Medium Shots, Close-ups, Medium Close-ups, and vertical tilts/pan-ups; avoid Wide or Extreme Wide shots where the subject gets lost in the narrow horizontal frame. Do NOT include wide-horizontal composition language (e.g. 'wide panoramic view', 'expansive horizon line', 'sweeping landscape framing').\n" +
      "- 16:9 (Widescreen): frame subjects horizontally using the Rule of Thirds — emphasize depth, background context, and horizontal scale. Prioritize Wide Shots, Extreme Wide Shots, Establishing Shots, and horizontal tracking shots to maximize environmental detail. Do NOT include constrained-vertical composition language (e.g. 'tight vertical crop', 'tall narrow framing').\n\n"),
    promptPart("establishing", "Establishing master shot", "storyboard.ts", "Establishing Master Shot: the FIRST shot in each new location must establish that space before any closer coverage of it — close shots hide spatial information, wide shots establish spatial truth, and every later shot in that location is generated against the layout this shot sets. Its `prompt` must show at least two named anchors from that location's FIXED LAYOUT and make their relative positions readable, and it must pin every character present left-to-right on screen (see SCREEN DIRECTION below) — a master shot that fixes the room but not the people leaves the next shot free to invent their order. " +
      "For 16:9 this is a true Wide or Establishing Shot. For 9:16 the vertical rules above still win — do NOT force a wide: use the widest ratio-appropriate framing instead (a wide medium or a vertical tilt revealing the space), still showing at least two named layout anchors. " +
      "Returning to a location later in the script does not need a new establishing shot unless its state has visibly changed.\n\n"),
    promptPart("cameraVariety", "Camera variety", "storyboard.ts", "Camera Variety: within the ratio-appropriate shot types above, do not repeat the same flat angle back-to-back across shots in a scene — vary coverage the way a real shot list does. When a shot continues a conversation or beat already established earlier in the scene, prefer 'Over-the-shoulder shot', 'Reaction shot', 'Panning shot', or a distinct new angle (still within the ratio's favored shot types) over repeating the previous shot's framing verbatim — this also hides small continuity drift between separately-generated shot images, since a deliberate angle change reads as a cut, not an error.\n\n"),
    promptPart("videoPrompt", "Video prompt", "storyboard.ts", "Video Prompt: describes motion only — the image it animates is the Start Frame, generated separately from this shot's `prompt`.\n" +
      "If a shot depicts a character speaking (has an adjacent [CHARACTER]/[DIALOG] pair in the script), the videoPrompt must quote that line verbatim with a language tag matching the language it's actually written in, e.g. `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"`. If a single line of dialogue is long enough that speaking it naturally would need more than ~6-8 seconds, do NOT stretch one shot's duration to cover the whole line — split it into multiple shorter shots instead (e.g. cut to a reaction/listener shot partway through, or a new angle on the same speaker), each carrying only the portion of the line spoken during that shot. Splitting on cuts is the standard approach for AI-generated dialogue scenes — short, reliable clips edited together beat one long single-take generation.\n" +
      "videoPrompt safety: AI video generators (e.g. Google Flow/Veo) run a separate IP/third-party-content filter that can block a prompt for describing a character with too many specific, iconic, signature-move-style gestures stacked in one action beat — this is especially likely for animal characters in speed/rivalry/competition contexts (a common trigger pattern resembles famous cartoon mascot behavior). Keep action description grounded in the scene's actual beat (what the script says happens) rather than piling on extra flourish gestures not needed to convey the action.\n\n"),
    promptPart("duration", "Duration", "storyboard.ts", "durationS is the recommended clip length for AI video generation — NEVER exceed 10 seconds, most AI video tools cannot export longer clips. Pick a realistic shorter duration (e.g. 2-6s) unless the action genuinely needs the full 10s.\n\n"),
    promptPart("assetsMatching", "Assets matching", "storyboard.ts", "ASSETS MATCHING:\n" +
      "- You are provided with a list of Known Assets (characters, locations, and/or props, given below) — this tells the user which reference images/prompts to attach when generating.\n" +
      "- When generating a shot's `prompt`, check which Known Assets appear in your text description.\n" +
      "- Every asset mentioned or depicted MUST be strictly listed in the assetsUsed array by its exact name, except a 'Character group', which is never listed. Cross-check before finalizing. Only include assets truly present in the shot's content, not every asset in the scene.\n" +
      "- A character listed with LOOKS has one reference sheet per stage of the story. Set its assetsUsed.look to the key of the look whose scenes include this shot's scene; when the script changes the character's appearance mid-scene, use the look the shot actually shows. Never mix two looks' hair or wardrobe in one shot, and write startState/endState wardrobe from the chosen look."),
    promptPart("siteMap", "Site map", "shared.ts", siteMapBlock()),
    promptPart("lighting", "Lighting", "shared.ts", lightingBlock()),
    promptPart("shotScale", "Shot scale", "shared.ts", shotScaleBlock()),
    promptPart("scriptFidelity", "Script fidelity", "shared.ts", scriptFidelityBlock()),
    promptPart("identityAnchor", "Identity anchor", "shared.ts", identityAnchorBlock()),
    promptPart("ambientPopulation", "Ambient population", "shared.ts", ambientPopulationBlock()),
    promptPart("locationSpatialConsistency", "Location spatial consistency", "shared.ts", locationSpatialConsistencyBlock()),
    promptPart("screenDirection", "Screen direction", "shared.ts", screenDirectionBlock()),
    promptPart("stateLedger", "State ledger", "shared.ts", stateLedgerBlock()),
    promptPart("shotDistinctness", "Shot distinctness", "shared.ts", shotDistinctnessBlock()),
    promptPart("motionDiscipline", "Motion discipline", "shared.ts", motionDisciplineBlock()),
    promptPart("motionStyle", "Motion style", "shared.ts", motionStyleBlock(motionStyleId)),
    promptPart("styleContext", "Visual style", "shared.ts", styleContextBlock(styleContext)),
    promptPart("regionAdaptation", "Region adaptation", "shared.ts", regionAdaptationBlock(region)),
    promptPart("outputLanguage", "Output language", "shared.ts", outputLanguageBlock()),
    promptPart("cozyAsmr", "Cozy ASMR format", "storyboard-asmr.ts", (format === "cozy-asmr" ? cozyAsmrFormatBlock() : "")),
  ]);
}

export function storyboardSystemPrompt(
  styleContext?: string | null,
  aspectRatio: string = DEFAULT_ASPECT_RATIO,
  region: Region = "english",
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
) {
  return joinPromptParts(storyboardSystemPromptParts(styleContext, aspectRatio, region, motionStyleId, format));
}

// Single-scene regeneration reuses every storyboard rule above, so the shots it
// returns stay format-identical to the ones generated in a full pass. Only the
// scope and the continuity handshake with the untouched neighbour scenes differ.
export const SCENE_SHOTS_SCHEMA = {
  type: "object",
  properties: { shots: STORYBOARD_SCHEMA.properties.scenes.items.properties.shots },
  required: ["shots"],
  additionalProperties: false,
} as const;

export function sceneShotsSchema(format: StoryFormat) {
  const shots = (storyboardSchema(format) as typeof STORYBOARD_SCHEMA).properties.scenes.items.properties.shots;
  return { ...SCENE_SHOTS_SCHEMA, properties: { shots } };
}

export type SceneRegenerationTarget = {
  index: number;
  title: string | null;
  slug: string | null;
  // Continuity ledger handshake: the neighbouring scenes are NOT regenerated,
  // so the new shots have to start where the previous scene ended and end where
  // the next scene already begins, or the state ledger breaks at the seams.
  previousEndState: string | null;
  nextStartState: string | null;
  // The chapter's stored site map, already rendered as text. This pass emits
  // no map of its own — re-deriving chapter geography from one scene is how a
  // revisited place picks up a second establishing shot and a character's
  // travel direction flips at the seam.
  siteMap: string | null;
  // The scene row is not replaced by a regeneration, so its lighting line
  // survives the re-shoot and the new shots must be written under it.
  lighting: string | null;
  // How many shots the take being replaced used, and what the user asked for
  // relative to it. Without an anchor this pass re-derives coverage from
  // nothing and drifts upward every time — see lib/constants/coverage-modes.ts.
  // Null count = the scene has no stored shots, and every mode reads as "free".
  previousShotCount: number | null;
  coverageMode: CoverageMode;
};

export function regenerateSceneSystemPrompt(
  target: SceneRegenerationTarget,
  styleContext?: string | null,
  aspectRatio: string = DEFAULT_ASPECT_RATIO,
  region: Region = "english",
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
) {
  return storyboardSystemPrompt(styleContext, aspectRatio, region, motionStyleId, format) + sceneScopePrompt(target);
}

// Prompt Lab appends this to its own storyboard prompt, so keep every
// scene-regeneration instruction inside it.
export function sceneScopePrompt(target: SceneRegenerationTarget) {
  const heading = [target.slug, target.title].filter(Boolean).join(" — ") || `scene ${target.index}`;
  return (
    "\n\nSCOPE — SINGLE SCENE REGENERATION:\n" +
    (target.siteMap
      ? "This chapter's SITE MAP is already settled — do NOT produce a new one, and do not renegotiate which place this scene plays in. Shoot the scene against it, including its establishing-coverage and travel-direction rules, and put every shot at one of the stations it lists for that place — their plates may already be rendered, so never invent a new station key:\n" +
        target.siteMap +
        "\n"
      : "This chapter has no stored site map, so judge this scene's place and any establishing coverage from the script alone.\n") +
    `You are given the whole script for context, but you re-shoot ONLY scene ${target.index}: ${heading}. ` +
    "Return that scene's shot list and nothing else — no other scene's shots, no scene title, no slug. " +
    "Cover exactly the script lines that belong to this scene heading, from it up to (but excluding) the next [SCENE] heading. " +
    "Every rule above still applies inside this scene: establishing coverage for a location this scene opens, camera variety, shot distinctness, duration caps, and assetsUsed cross-checking.\n" +
    (target.previousEndState
      ? `The scene before this one ends in this state — your first shot's startState must continue from it unless the script explicitly changes something: ${target.previousEndState}\n`
      : "This is the chapter's first scene, so its opening state is set by the script alone.\n") +
    (target.nextStartState
      ? `The scene after this one is NOT being regenerated and already opens in this state — your last shot's endState must hand off to it: ${target.nextStartState}\n`
      : "This is the chapter's last scene, so nothing follows it.\n") +
    (target.lighting
      ? `This scene's lighting is already set and is NOT regenerated — write every shot under it, stating light only as a delta the script calls for: ${target.lighting}\n`
      : "This scene has no stored lighting line, so judge its light from the script alone.\n") +
    "Produce at least one shot, and at least one distinct shot for every [VOICE_OVER] block falling inside this scene.\n" +
    coverageModeInstruction(target.coverageMode, target.previousShotCount)
  );
}
