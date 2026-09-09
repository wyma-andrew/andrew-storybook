import type { Region } from "../constants/regions";
import {
  styleContextBlock,
  outputLanguageBlock,
  myanmarAdaptationBlock,
  locationSpatialLayoutBlock,
  characterIdentityBlock,
} from "./shared";

export const ASSET_SCHEMA = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Keeper · 34'" },
          realPrompt: {
            type: "string",
            description:
              "Structured CHARACTER / IDENTITY LOCK / WARDROBE LOCK / VARIABLE format (see system prompt) — entity-specific visual facts ONLY, with the invariant traits (physical identity, garments) separated from the per-shot ones (expression, pose, gaze). No camera, lighting, or style wording — that is injected separately. " +
              "The lock bullets are copied verbatim into every shot this character appears in, so keep each one short and self-contained.",
          },
        },
        required: ["name", "meta", "realPrompt"],
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
        required: ["name", "meta", "spaceKind", "realPrompt"],
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
          realPrompt: {
            type: "string",
            description: "Structured PROP / IDENTITY LOCK / VARIABLE format — distinctive physical identity, material, condition, markings, and scale only.",
          },
        },
        required: ["name", "meta", "realPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["characters", "locations", "props"],
  additionalProperties: false,
} as const;

export function extractAssetsSystemPrompt(styleContext?: string | null, region: Region = "english") {
  return (
    "You extract characters, locations, and visually important recurring props from a story script for a storyboard tool. Only describe visual identity facts, never camera/lighting/art-style — those are injected by the app separately. Extract props when they are distinct, story-relevant objects that appear, are handled, or recur; do not extract every incidental background object. " +
    "Location realPrompt must describe the empty space only — never name or describe any character, person, animal, or their action, even if they occupy that location in the scene. " +
    // One physical place must come out as one location row. Splitting it into
    // "front yard" + "backyard" gives each half its own reference image and its
    // own architecture, so the same house renders differently shot to shot.
    "ONE PLACE = ONE LOCATION: merge into a single location every area that belongs to the same physical building, house, yard, compound, or site — its front yard, backyard, porch, and surrounding grounds are one exterior location with several VIEWS, one STRUCTURE SHELL, and one FIXED LAYOUT, not separate locations. Keep locations separate only when they are genuinely different spaces: separate rooms, or an interior and an unrelated exterior. Give each merged location one natural canonical name covering the whole place, and cover its distinct areas inside FIXED LAYOUT. " +
    "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure." +
    characterIdentityBlock() +
    locationSpatialLayoutBlock() +
    "\n\nPROP IDENTITY: every prop's realPrompt must use PROP / IDENTITY LOCK / VARIABLE sections. Describe silhouette, material, color, finish, construction, distinctive marks, scale, and meaningful variable state. Do not describe a character holding it, a location around it, camera, lighting, or style." +
    styleContextBlock(styleContext) +
    (region === "myanmar" ? myanmarAdaptationBlock() : "") +
    outputLanguageBlock()
  );
}
