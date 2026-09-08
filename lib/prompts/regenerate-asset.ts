import type { Region } from "../constants/regions";
import {
  styleContextBlock,
  outputLanguageBlock,
  myanmarAdaptationBlock,
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

// Regenerates a single already-extracted asset's realPrompt (per-card "Regenerate"
// button) — same rules as extractAssets, scoped to one named character/location.
// The structured-format block for the matching kind MUST be injected here too:
// without it, regenerating one asset silently drops the structure that the
// storyboard step's consistency/anchoring blocks depend on downstream.
export function regenerateAssetSystemPrompt(
  kind: "character" | "location",
  styleContext?: string | null,
  region: Region = "english"
) {
  const rules =
    kind === "location"
      ? "Describe the EMPTY environment only: structure, materials, props, layout, fixed signage/text. No camera, lighting, or style wording. " +
        "Never mention characters, people, animals, or anyone's action/pose/expression, even if the script's scene has them present."
      : "Describe entity-specific visual facts only: physical identity, wardrobe, build, expression. No camera, lighting, or style wording.";

  return (
    `You regenerate the visual identity prompt for one ${kind} extracted from a story script for a storyboard tool. ` +
    rules +
    " The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure." +
    (kind === "location" ? locationSpatialLayoutBlock() : characterIdentityBlock()) +
    styleContextBlock(styleContext) +
    (region === "myanmar" ? myanmarAdaptationBlock() : "") +
    outputLanguageBlock()
  );
}
