// Admin-predefined boilerplate stitched onto character/location asset prompts
// at copy time (see lib/prompt-copy.ts withAssetContext). Was the DB-backed
// `system_prompts` table (kind='character' | 'location') — extracted here
// verbatim from the live rows. To change these, edit this file directly.

export const SYSTEM_PROMPTS = {
  character:
    "Character reference sheet: full-body turnaround, front view / 3-quarter view / side view / back view, neutral standing pose, arranged left to right, consistent scale and studio lighting across all views, plain neutral background, no props or background elements. Maintain exact facial structure, hairstyle, and wardrobe identically across every view and every future generation of this character. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  location:
    "Location reference sheet: wide establishing view plus 2-3 fixed camera angles of the same space (e.g. entry view, opposite-corner view). Identical architecture, furniture and prop placement, wall colors/materials, and light source direction across every view and every future generation. Lock time of day and color palette. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
} as const;

export type SystemPromptKind = keyof typeof SYSTEM_PROMPTS;
