import type { Region } from "../constants/regions";
import { joinPromptParts, nonEmptyParts, promptPart, type PromptPart } from "./parts";
import {
  styleContextBlock,
  outputLanguageBlock,
  regionAdaptationBlock,
  locationSpatialLayoutBlock,
  characterIdentityBlock,
  storyComprehensionBlock,
  characterLooksBlock,
  characterGroupBlock,
  socialStandingBlock,
} from "./shared";

const SCENE_REFS = {
  type: "array",
  items: { type: "string" },
  description: "the scenes this asset appears in, as '<scene number> <heading>'",
} as const;

export const LOOKS = {
  type: "array",
  description: "CHARACTER LOOKS (see system prompt): one entry per lasting stage of appearance, in story order; [] when the character has one appearance throughout",
  items: {
    type: "object",
    properties: {
      key: { type: "string" },
      label: { type: "string" },
      scenes: SCENE_REFS,
      prompt: { type: "string", description: "LOOK / APPEARANCE LOCK / WARDROBE LOCK format" },
    },
    required: ["key", "label", "scenes", "prompt"],
    additionalProperties: false,
  },
} as const;

const EVIDENCE = {
  type: "string",
  description: "one or two sentences: what in those scenes' action, dialog, or narration shows this asset and why it is its own asset",
} as const;

// storyAnalysis comes first so the model reads the story before it writes any
// asset — strict JSON output is produced in schema order. It is logged, never
// stored.
export const ASSET_SCHEMA = {
  type: "object",
  properties: {
    storyAnalysis: {
      type: "object",
      properties: {
        sceneMap: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scene: { type: "string", description: "'<scene number> <heading>'" },
              place: { type: "string", description: "the physical place the scene's action is staged in, decided from the action — not copied from the heading" },
              depiction: { type: "string", description: "how this scene portrays that place: features, condition, contents, what happens there" },
            },
            required: ["scene", "place", "depiction"],
            additionalProperties: false,
          },
        },
        places: {
          type: "array",
          items: {
            type: "object",
            properties: {
              place: { type: "string" },
              scenes: SCENE_REFS,
              reasoning: { type: "string", description: "why these scenes are one place, and why it is distinct from any similar-sounding place" },
            },
            required: ["place", "scenes", "reasoning"],
            additionalProperties: false,
          },
        },
        characterArcs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              character: { type: "string" },
              arc: { type: "string", description: "how this character's role, condition, and appearance change across the scenes, with scene numbers" },
            },
            required: ["character", "arc"],
            additionalProperties: false,
          },
        },
      },
      required: ["sceneMap", "places", "characterArcs"],
      additionalProperties: false,
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Keeper · 34'" },
          scenes: SCENE_REFS,
          evidence: EVIDENCE,
          realPrompt: {
            type: "string",
            description:
              "Structured CHARACTER / IDENTITY LOCK / WARDROBE LOCK / VARIABLE format (see system prompt) — entity-specific visual facts ONLY, with the invariant traits (physical identity, garments) separated from the per-shot ones (expression, pose, gaze). No camera, lighting, or style wording — that is injected separately. " +
              "The lock bullets are copied verbatim into every shot this character appears in, so keep each one short and self-contained.",
          },
          looks: LOOKS,
          isGroup: { type: "boolean", description: "true for a nameless recurring collective (see CHARACTER GROUPS), false for one individual" },
        },
        required: ["name", "meta", "scenes", "evidence", "realPrompt", "looks", "isGroup"],
        additionalProperties: false,
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Interior · scene 1'" },
          scenes: SCENE_REFS,
          evidence: EVIDENCE,
          spaceKind: {
            type: "string",
            enum: ["interior", "exterior"],
            description:
              "'interior' = an enclosed space seen from within (room, shop floor, vehicle interior). " +
              "'exterior' = an outdoor place or a building seen from outside (yard, street, house compound). " +
              "Chooses which reference-image preset and plan drawing the app generates, so it must match what STRUCTURE SHELL describes.",
          },
          realPrompt: {
            type: "string",
            description:
              "Structured LOCATION / FIXED LAYOUT / SPATIAL RULES format (see system prompt) — entity-specific visual facts and a fixed, unambiguous spatial layout ONLY: structure, materials, props, and where each fixed object/anchor sits and faces. No camera, lighting, or style wording. " +
              "Describe the EMPTY environment only — never mention characters, people, animals, or anyone's action/pose/expression, even if the script's scene has them present. Character presence is added separately per-shot.",
          },
        },
        required: ["name", "meta", "scenes", "evidence", "spaceKind", "realPrompt"],
        additionalProperties: false,
      },
    },
    props: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Brass key · recurring'" },
          scenes: SCENE_REFS,
          evidence: EVIDENCE,
          realPrompt: {
            type: "string",
            description: "Structured PROP / IDENTITY LOCK / VARIABLE format — distinctive physical identity, material, condition, markings, and scale only.",
          },
        },
        required: ["name", "meta", "scenes", "evidence", "realPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["storyAnalysis", "characters", "locations", "props"],
  additionalProperties: false,
} as const;

export function extractAssetsSystemPromptParts(styleContext?: string | null, region: Region = "english"): PromptPart[] {
  return nonEmptyParts([
    promptPart("role", "Role & visual-only rule", "extract-assets.ts", "You extract characters, locations, and visually important recurring props from a story script for a storyboard tool. Only describe visual identity facts, never camera/lighting/art-style — those are injected by the app separately. Extract props when they are distinct, story-relevant objects that appear, are handled, or recur; do not extract every incidental background object. "),
    promptPart("emptyLocation", "Empty locations", "extract-assets.ts", "Location realPrompt must describe the empty space only — never name or describe any character, person, animal, or their action, even if they occupy that location in the scene. "),
    // One physical place must come out as one location row. Splitting it into
    // "front yard" + "backyard" gives each half its own reference image and its
    // own architecture, so the same house renders differently shot to shot.
    promptPart("onePlace", "One place = one location", "extract-assets.ts", "ONE PLACE = ONE LOCATION: merge into a single location every area that belongs to the same physical building, house, yard, compound, or site — its front yard, backyard, porch, and surrounding grounds are one exterior location with several VIEWS, one STRUCTURE SHELL, and one FIXED LAYOUT, not separate locations. Keep locations separate only when they are genuinely different spaces: separate rooms, or an interior and an unrelated exterior. Give each merged location one natural canonical name covering the whole place, and cover its distinct areas inside FIXED LAYOUT. "),
    promptPart("scriptTags", "Script tags", "extract-assets.ts", "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [VOICE_OVER] (anonymous narration), [TRANSITION]. Use these tags as ground truth for structure. Voice Over may reveal visual entities, but it has no speaker and never creates a narrator character by itself."),
    promptPart("storyAnalysis", "Story analysis first", "extract-assets.ts", "\n\nSTORY ANALYSIS FIRST: fill storyAnalysis before any asset. Number the [SCENE] headings 1, 2, 3… in script order. sceneMap: one entry per scene, giving the physical place its action is staged in and how the scene portrays it. places: group the scenes by physical place and justify each grouping. characterArcs: how each on-screen character's role, condition, and appearance change across the scenes. Then derive the characters, locations, and props from that analysis — every location must be one of the places, and every asset's scenes and evidence must come from it."),
    promptPart("storyComprehension", "Story comprehension", "shared.ts", storyComprehensionBlock()),
    promptPart("characterIdentity", "Character identity", "shared.ts", characterIdentityBlock()),
    promptPart("characterLooks", "Character looks", "shared.ts", characterLooksBlock()),
    promptPart("characterGroup", "Character groups", "shared.ts", characterGroupBlock()),
    promptPart("socialStanding", "Social standing", "shared.ts", socialStandingBlock()),
    promptPart("locationSpatialLayout", "Location spatial layout", "shared.ts", locationSpatialLayoutBlock()),
    promptPart("propIdentity", "Prop identity", "extract-assets.ts", "\n\nPROP IDENTITY: every prop's realPrompt must use PROP / IDENTITY LOCK / VARIABLE sections. Describe silhouette, material, color, finish, construction, distinctive marks, scale, and meaningful variable state. Do not describe a character holding it, a location around it, camera, lighting, or style."),
    promptPart("styleContext", "Visual style", "shared.ts", styleContextBlock(styleContext)),
    promptPart("regionAdaptation", "Region adaptation", "shared.ts", regionAdaptationBlock(region)),
    promptPart("outputLanguage", "Output language", "shared.ts", outputLanguageBlock()),
  ]);
}

export function extractAssetsSystemPrompt(styleContext?: string | null, region: Region = "english") {
  return joinPromptParts(extractAssetsSystemPromptParts(styleContext, region));
}
