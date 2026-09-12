// Stored prompts (character/location/shot) are style-agnostic by design —
// the AI is told not to bake style keywords into them. The actual style tag
// is appended here, at copy time, so switching a story's Style never
// requires regenerating prompts. Scene lighting is composed the same way and
// for the same reason (lib/prompts/shared.ts, lightingBlock).
//
// ORDER — content, then style, then lighting, then framing optics.
// Superseded on 2026-09-11: style used to LEAD every copied prompt, because a
// style tag trailing a long, hyper-specific prompt was getting drowned out and
// Myanmar-adapted content drifted toward photorealism. Shot copies now follow
// the subject → environment → style → lighting order instead: the shot text
// already opens with the subject and the space, and style sits directly after
// it rather than at the very end, so it is not the trailing-tag case that
// failed. Watch for that photoreal drift returning on Myanmar/Buddha regions —
// that is the risk this order re-opens.
//
// Asset copies are NOT reordered: their system preset is reference-sheet
// framing/lighting boilerplate, which only makes sense read together with the
// style it renders in, ahead of the entity's own facts.

function styleTag(styleContext?: string | null): string | null {
  return styleContext ? `[Style] ${styleContext}` : null;
}

function lightingTag(lighting?: string | null): string | null {
  return lighting ? `[Lighting] ${lighting}` : null;
}

// Depth of field and background treatment for this shot's framing scale
// (lib/constants/shot-scales.ts). It trails lighting because it is optics, not
// content or look: it says how much of what the prompt already described stays
// in focus. Null on shots with no stored scale, which then copy as before.
function framingTag(optics?: string | null): string | null {
  return optics ? `[Framing] ${optics}` : null;
}

// Shot start-frame copy: what the shot shows, then how it is rendered, then
// the scene's light.
export function withStyle(
  prompt: string,
  styleContext?: string | null,
  lighting?: string | null,
  optics?: string | null
): string {
  return [prompt, styleTag(styleContext), lightingTag(lighting), framingTag(optics)].filter(Boolean).join("\n\n");
}

// Character/location prompts (ChapterAsset.realPrompt) hold entity-specific
// visual facts ONLY — the AI is told never to write camera/lighting/
// composition wording into them (that's exactly what SYSTEM_PROMPTS.character
// / .location, lib/constants/system-prompts.ts, holds). So, like Style, that
// boilerplate is stitched on at copy time, not baked in at generation time —
// editing the constant takes effect immediately on every future copy, no
// regeneration needed. A reference sheet is deliberately lit neutrally, so no
// scene lighting is composed in here.
export function withAssetContext(realPrompt: string, systemPrompt?: string | null, styleContext?: string | null): string {
  return [styleTag(styleContext), systemPrompt, realPrompt].filter(Boolean).join("\n\n");
}

// Video prompt describes motion only, so it's meaningless without the frame
// it's animating — stitch the start frame description in ahead of it at copy
// time. The videoPrompt stays directly next to that frame description: it says
// what happens in the clip and quotes any spoken line, and the two are read
// together. Style and lighting follow the pair, matching the start-frame copy.
// motionText is the predefined paragraph for this shot's motion mode
// (lib/constants/motion-styles.ts). Like Style, it is composed here rather
// than stored on the shot, so changing a story's motion style re-renders every
// video prompt without regenerating the storyboard. It trails everything
// deliberately: it is a separate, labelled constraint block on how much the
// action is allowed to move, not part of the shot's description.
export function withFrameDescription(
  videoPrompt: string,
  startFramePrompt: string,
  styleContext?: string | null,
  motionText?: string | null,
  lighting?: string | null,
  optics?: string | null
): string {
  return [
    startFramePrompt,
    videoPrompt,
    styleTag(styleContext),
    lightingTag(lighting),
    framingTag(optics),
    motionText,
  ]
    .filter(Boolean)
    .join("\n\n");
}
