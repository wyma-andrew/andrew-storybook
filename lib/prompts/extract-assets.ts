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
  },
  required: ["characters", "locations"],
  additionalProperties: false,
} as const;

export function extractAssetsSystemPrompt(styleContext?: string | null, region: Region = "english") {
  return (
    "You extract characters and locations from a story script for a storyboard tool. Only describe visual identity facts, never camera/lighting/art-style — those are injected by the app separately. " +
    "Location realPrompt must describe the empty space only — never name or describe any character, person, animal, or their action, even if they occupy that location in the scene. " +
    "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure." +
    characterIdentityBlock() +
    locationSpatialLayoutBlock() +
    styleContextBlock(styleContext) +
    (region === "myanmar" ? myanmarAdaptationBlock() : "") +
    outputLanguageBlock()
  );
}
