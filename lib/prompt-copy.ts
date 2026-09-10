// Stored prompts (character/location/shot) are style-agnostic by design —
// the AI is told not to bake style keywords into them. The actual style tag
// is appended here, at copy time, so switching a story's Style never
// requires regenerating prompts.
// Style leads (not trails) the prompt — image models tend to weight earlier
// tokens more strongly, and a style tag stuck at the end was getting drowned
// out by long, hyper-specific content (real materials/objects), especially
// for Myanmar-adapted content pulling toward photorealism.
export function withStyle(prompt: string, styleContext?: string | null): string {
  return styleContext ? `[Style] ${styleContext}\n\n${prompt}` : prompt;
}

// Character/location prompts (ChapterAsset.realPrompt) hold entity-specific
// visual facts ONLY — the AI is told never to write camera/lighting/
// composition wording into them (that's exactly what SYSTEM_PROMPTS.character
// / .location, lib/constants/system-prompts.ts, holds). So, like Style, that
// boilerplate is stitched on at copy time, not baked in at generation time —
// editing the constant takes effect immediately on every future copy, no
// regeneration needed.
export function withAssetContext(realPrompt: string, systemPrompt?: string | null, styleContext?: string | null): string {
  const parts = [styleContext ? `[Style] ${styleContext}` : null, systemPrompt, realPrompt].filter(Boolean);
  return parts.join("\n\n");
}

// Video prompt describes motion only, so it's meaningless without the frame
// it's animating — stitch the start frame description in ahead of it at copy
// time. Style leads here for the same reason it does in withStyle: the frame
// description this wraps is long and specific, and the clip has to stay in the
// same look as the still it animates.
// motionText is the predefined paragraph for this shot's motion mode
// (lib/constants/motion-styles.ts). Like Style, it is composed here rather
// than stored on the shot, so changing a story's motion style re-renders every
// video prompt without regenerating the storyboard. It trails the videoPrompt
// deliberately: the videoPrompt says what happens and quotes any spoken line,
// and it belongs next to the frame description it animates — the motion
// paragraph is a separate, labelled constraint block on how much that action
// is allowed to move.
export function withFrameDescription(
  videoPrompt: string,
  startFramePrompt: string,
  styleContext?: string | null,
  motionText?: string | null
): string {
  const parts = [
    styleContext ? `[Style] ${styleContext}` : null,
    startFramePrompt,
    videoPrompt,
    motionText,
  ].filter(Boolean);
  return parts.join("\n\n");
}
