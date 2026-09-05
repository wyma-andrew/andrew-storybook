// Stored prompts (character/location/shot) are style-agnostic by design —
// the AI is told not to bake style keywords into them. The actual style tag
// is appended here, at copy time, so switching a story's Style never
// requires regenerating prompts.
export function withStyle(prompt: string, styleContext?: string | null): string {
  return styleContext ? `${prompt}\n\n[Style] ${styleContext}` : prompt;
}

// Character/location prompts (ChapterAsset.realPrompt) hold entity-specific
// visual facts ONLY — the AI is told never to write camera/lighting/
// composition wording into them (that's exactly what SYSTEM_PROMPTS.character
// / .location, lib/constants/system-prompts.ts, holds). So, like Style, that
// boilerplate is stitched on at copy time, not baked in at generation time —
// editing the constant takes effect immediately on every future copy, no
// regeneration needed.
export function withAssetContext(realPrompt: string, systemPrompt?: string | null, styleContext?: string | null): string {
  const parts = [systemPrompt, realPrompt, styleContext ? `[Style] ${styleContext}` : null].filter(Boolean);
  return parts.join("\n\n");
}
