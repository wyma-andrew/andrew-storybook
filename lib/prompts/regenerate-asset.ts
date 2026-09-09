import type { Region } from "../constants/regions";
import {
  styleContextBlock,
  outputLanguageBlock,
  regionAdaptationBlock,
  locationSpatialLayoutBlock,
  characterIdentityBlock,
} from "./shared";

export const REGENERATE_SCHEMA = {
  type: "object",
  properties: {
    realPrompt: {
      type: "string",
      description: "entity-specific visual description ONLY, in the structured format given, per the rules given.",
    },
  },
  required: ["realPrompt"],
  additionalProperties: false,
} as const;

// Locations carry spaceKind alongside the prompt — it picks the reference-image
// preset (interior view + floor plan, or exterior view + site plan), so a
// regenerate that changed a location from a room to a compound has to be able
// to change it too. Kept as a separate schema rather than an optional field:
// the response format is strict, so every property must be required, and a
// character has no spaceKind to give.
export const REGENERATE_LOCATION_SCHEMA = {
  type: "object",
  properties: {
    realPrompt: {
      type: "string",
      description: "entity-specific visual description ONLY, in the structured format given, per the rules given.",
    },
    spaceKind: {
      type: "string",
      enum: ["interior", "exterior"],
      description:
        "'interior' = an enclosed space seen from within. 'exterior' = an outdoor place or a building seen from outside. Must match what STRUCTURE SHELL describes.",
    },
  },
  required: ["realPrompt", "spaceKind"],
  additionalProperties: false,
} as const;

// Regenerates a single already-extracted asset's realPrompt (per-card "Regenerate"
// button) — same rules as extractAssets, scoped to one named character/location.
// The structured-format block for the matching kind MUST be injected here too:
// without it, regenerating one asset silently drops the structure that the
// storyboard step's consistency/anchoring blocks depend on downstream.
export function regenerateAssetSystemPrompt(
  kind: "character" | "location" | "prop",
  styleContext?: string | null,
  region: Region = "english"
) {
  const rules =
    kind === "location"
      ? "Describe the EMPTY environment only: structure, materials, props, layout, fixed signage/text. No camera, lighting, or style wording. " +
        "Never mention characters, people, animals, or anyone's action/pose/expression, even if the script's scene has them present."
      : kind === "prop"
        ? "Describe the object's visual identity only: silhouette, material, color, finish, construction, markings, scale, and meaningful variable state. No camera, lighting, or style wording."
        : "Describe entity-specific visual facts only: physical identity, wardrobe, build, expression. No camera, lighting, or style wording.";

  return (
    `You regenerate the visual identity prompt for one ${kind} extracted from a story script for a storyboard tool. ` +
    rules +
    " The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [VOICE_OVER] (anonymous narration), [TRANSITION]. Use these tags as ground truth for structure. Voice Over may reveal visual entities, but it has no speaker and never creates a narrator character by itself." +
    (kind === "location"
      ? locationSpatialLayoutBlock()
      : kind === "prop"
        ? "\n\nPROP IDENTITY: use PROP / IDENTITY LOCK / VARIABLE sections. Keep the identity lock short and self-contained."
        : characterIdentityBlock()) +
    styleContextBlock(styleContext) +
    regionAdaptationBlock(region) +
    outputLanguageBlock()
  );
}
