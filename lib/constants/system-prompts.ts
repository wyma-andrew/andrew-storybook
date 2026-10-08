import type { SpaceKind } from "@/lib/api/types";

// Admin-predefined boilerplate stitched onto character/location asset prompts
// at copy time (see lib/prompt-copy.ts withAssetContext). Was the DB-backed
// `system_prompts` table (kind='character' | 'location') — extracted here
// verbatim from the live rows. To change these, edit this file directly.

export const SYSTEM_PROMPTS = {
  character:
    "Character reference sheet: full-body turnaround, front view / 3-quarter view / side view / back view, neutral standing pose, arranged left to right, consistent scale and studio lighting across all views, plain neutral background, no props or background elements. Maintain exact facial structure, hairstyle, and wardrobe identically across every view and every future generation of this character. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  prop:
    "Prop reference sheet: the complete object shown clearly from front, 3-quarter, side, and top views, arranged left to right at a consistent scale on a plain neutral background. Preserve the exact silhouette, material, color, finish, construction details, markings, wear, and proportions in every view and every future generation of this prop. No characters, hands, background objects, text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  locationInterior:
    "Location reference image: a fully rendered eye-level interior establishing view of the finished room — one frame, normal perspective, the whole space readable. " +
    // Written affirmatively on purpose. An earlier version listed what must not
    // appear (labels, north arrow, overhead viewpoint) and got exactly that
    // back: image models handle negation poorly, and naming a thing raises its
    // salience. Describing the picture to make works where forbidding one
    // doesn't. See also the style's reference clause, dropped for the plan copy
    // in resolveStyleContext.
    "Camera: standing eye height, roughly 1.6 m above the floor, positioned just inside the main entrance looking across the room, side walls converging naturally in perspective, floor-to-wall and wall-to-ceiling junctions visible. " +
    "Use the attached floor plan ONLY to determine room geometry and object placement — which wall each doorway, window, and fixture sits on, and where furniture sits relative to them. Render the finished room itself, in the story's visual style, as it would be photographed from inside. " +
    "Additional angles are generated separately later, each using this view plus the floor plan as reference, once a specific shot actually needs one. " +
    "Lock time of day, color palette, architecture, furniture/prop placement, and light source direction — reuse identically across every future generation of this location. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  // Third copy variant for locations: a second (or third) view of a place that
  // ALREADY has an approved canonical image. Generated LAST and never in
  // parallel with the canonical view — that parallelism is the bug it fixes.
  // A house's front and its rear, generated independently from two prompts,
  // agree on nothing: roof pitch, plank colour, storey height and scale all
  // get re-invented, because two separate generations share no pixels. Here
  // the canonical image is attached and the prompt is worded as a camera MOVE
  // on an existing building, so the shell is copied from the picture rather
  // than re-derived from words. The STRUCTURE SHELL bullets in the asset's
  // prompt are the cross-check on that copy, not its source.
  //
  // The <view> line is the one thing the user fills in — pick the matching
  // bullet from the asset's VIEWS list (see locationSpatialLayoutBlock).
  locationAltAngle:
    "Additional view of a location that already exists. ATTACH the approved reference image of this location and its floor/site plan. " +
    "This is the SAME place in the same story — the camera moves to another position, the place itself is unchanged. Do not design a new building or a new room. " +
    "Camera: standing eye height, roughly 1.6 m above the floor/ground, placed for the view named below, one frame, normal perspective, the whole space readable. " +
    "View to render: <paste the matching bullet from the VIEWS list below, e.g. 'Rear (from north)'>. " +
    "Everything in STRUCTURE SHELL below is already visible in the attached reference image — reproduce it identically from that image: same storey height, footprint and scale, same roof form, pitch, material and colour, same wall material, finish, colour and weathering, same time of day, light source direction, and colour palette. " +
    "Use the attached plan to place doorways, windows, stairs, and fixed props on the correct side for this view. The VIEWS bullet you paste above states what belongs at frame left and at frame right — follow it exactly and do not mirror the layout. " +
    "Render the finished place in the story's visual style, as it would be photographed from this position. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  // Second copy variant for locations (not a `kind` — locations have two
  // reference outputs), and the one generated FIRST. Geometry errors are
  // obvious on a plan and invisible in a perspective render, so the plan is
  // where the layout gets checked and corrected — cheaply, and before a wide
  // view exists to contradict it. Once approved it seeds the wide view and
  // answers "what's on the wall we haven't seen" for every reverse angle.
  //
  // Note the text is the actual source of truth: both images render the same
  // FIXED LAYOUT / SPATIAL RULES bullets, and the storyboard builds shot
  // prompts from them too, so a layout fix belongs in the asset's prompt —
  // regenerating an image around a wrong bullet fixes nothing downstream.
  //
  // Deliberately unlike the other two presets in three ways: labels are
  // REQUIRED (a plan without them anchors nothing, whereas burned-in text
  // ruins a normal shot image), it must stay a flat diagram, and it is copied
  // WITHOUT the story's [Style] — a stylized 3D "floor plan" is decorative,
  // not a spatial reference. See the copy sites in the Assets/Bible pages.
  locationFloorPlan:
    "Top-down architectural floor plan of this location, drawn as a flat 2D schematic diagram — orthographic overhead view, no perspective, no depth, no 3D rendering, no artistic style. " +
    "Clean thin black line work on a plain white background, in the manner of a technical blueprint or an IKEA-style layout diagram. " +
    "Draw walls as solid lines, doorways as gaps with a quarter-arc showing which way the door swings, and windows as breaks in the wall line. Show each fixed furniture and prop item as a simple labelled footprint outline in its stated position. " +
    "Include a north arrow. Text labels ARE required on this image — label every wall by its compass direction and every fixed object with the exact same name used in the FIXED LAYOUT list below, so the plan and the written layout can be read against each other. " +
    "Use only the objects and positions given below — do not add furniture, rooms, or props that are not listed, and do not rearrange anything. No characters, no people. No color, shading, textures, or decoration.",

  // Exterior counterparts of the two presets above, selected by a location's
  // spaceKind. They exist because the interior wording ("establishing view of
  // the finished ROOM", "just inside the main entrance", "wall-to-ceiling
  // junctions") was being applied to outdoor locations — a house compound with
  // a front and a rear view rendered as a room interior, because the preset
  // contradicted the prompt and the preset won.
  // Its camera line (and locationInterior's) is restated as THE REFERENCE
  // STATION in locationSpatialConsistencyBlock. Change one, change both.
  locationExterior:
    "Location reference image: a fully rendered eye-level exterior establishing view of the finished place — one frame, normal perspective, the whole subject readable. " +
    "Camera: standing eye height, roughly 1.6 m above the ground, positioned inside the grounds facing the main structure's front face as given in the FIXED LAYOUT below, far enough back that the structure reads whole from ground line to roof ridge, with the ground plane and the immediate surroundings visible. " +
    "When the VIEWS list below names this view, it also states what sits at frame left and at frame right — follow that exactly and do not mirror the layout. " +
    "Use the attached site plan ONLY to determine layout: which side each door, stair, window, and outbuilding sits on, and where each object sits relative to the others. Render the finished place itself, in the story's visual style, as it would be photographed standing on the ground there. " +
    "Additional views — the rear and other faces listed under VIEWS — are generated separately later, each using this view plus the site plan as reference, once a specific shot actually needs one. " +
    "Lock time of day, color palette, architecture, structure and prop placement, and light source direction — reuse identically across every future generation of this location. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",

  locationSitePlan:
    "Top-down architectural site plan of this location, drawn as a flat 2D schematic diagram — orthographic overhead view, no perspective, no depth, no 3D rendering, no artistic style. " +
    "Clean thin black line work on a plain white background, in the manner of a technical survey drawing. " +
    "Draw each building as its footprint outline with the roof ridge marked as a dashed center line, doorways as gaps with a quarter-arc showing which way the door swings, stairs as a run of parallel lines, and the boundary of the grounds as a solid line. Show each outbuilding, fixed prop, and planting as a simple labelled footprint outline in its stated position. " +
    "Include a north arrow. Text labels ARE required on this image — label every face of the main structure by its compass direction and every fixed object with the exact same name used in the FIXED LAYOUT list below, so the plan and the written layout can be read against each other. " +
    "Use only the structures, objects, and positions given below — do not add buildings, props, or planting that are not listed, and do not rearrange anything. No characters, no people. No color, shading, textures, or decoration.",

  // The multi-view alternative to generating each view separately, for a
  // location whose prompt carries a VIEWS list. Views rendered in ONE
  // generation share pixels, so scale, light direction, palette and materials
  // cannot disagree between them — which is the whole failure this started
  // from (a house's front and rear, generated apart, agreeing on nothing).
  //
  // Panel count follows the VIEWS list rather than being fixed at two: a place
  // with three faces gets three panels. It is capped at 3 where VIEWS is
  // written (locationSpatialLayoutBlock) because the panels split one image's
  // resolution — past three, each view is too small to work as a reference,
  // and the extra faces are better added one at a time via locationAltAngle,
  // which also stays the path for redoing a single view later.
  //
  // Same construction as SYSTEM_PROMPTS.character: one sheet, several views,
  // consistent scale and lighting across them.
  locationViewsSheet:
    "Location views sheet: ONE image split into equal side-by-side panels showing the SAME place from each vantage point named in the VIEWS list below — one panel per VIEWS bullet, arranged left to right in the order they are listed. " +
    "Every panel: eye-level camera roughly 1.6 m above the ground/floor, the same distance from the subject, the same scale, the same time of day, the same light source direction, and the same color palette, so the panels read as photographs taken minutes apart. " +
    "The place is identical in every panel — same storey height, footprint and proportions, same roof form, pitch, material and color, same wall material, finish and weathering. Only the side facing the camera changes, and each panel shows only what its own VIEWS bullet lists. " +
    "Each VIEWS bullet states what sits at frame left and at frame right for that vantage — follow it exactly, panel by panel. Do not mirror a panel to make it compose better: the frame sides are the whole point of the sheet. " +
    "Use the attached plan ONLY to determine which door, stair, window, outbuilding, and fixed prop belongs on each side. Render the finished place in the story's visual style. " +
    "Separate the panels with a thin plain gutter and keep the background treatment consistent across all of them. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
} as const;

// A location's two copy buttons pick their preset from spaceKind. Null (a
// character, or a row extracted before the field existed) falls back to the
// interior pair, which is what every location was generated with before.
export function locationViewPreset(spaceKind: SpaceKind | null | undefined) {
  return spaceKind === "exterior" ? SYSTEM_PROMPTS.locationExterior : SYSTEM_PROMPTS.locationInterior;
}

export function locationPlanPreset(spaceKind: SpaceKind | null | undefined) {
  return spaceKind === "exterior" ? SYSTEM_PROMPTS.locationSitePlan : SYSTEM_PROMPTS.locationFloorPlan;
}

// The plan button's label follows the preset — a site plan of a compound is
// not a "floor plan", and the mismatch is what made the wrong one easy to miss.
export function locationPlanLabel(spaceKind: SpaceKind | null | undefined) {
  return spaceKind === "exterior" ? "Site plan" : "Floor plan";
}

// The views sheet only means anything for a location the extractor gave more
// than one vantage to, so the button appears only when the prompt actually
// carries a VIEWS section. Reading the prompt text rather than adding a column:
// the section is written by the same step that would set the flag, so a flag
// would only be a second copy of the same fact, free to fall out of sync.
export function hasMultipleViews(realPrompt: string) {
  return /^VIEWS:/m.test(realPrompt);
}

// Tooltip copy for a location's four copy buttons, kept next to the presets
// they describe so the two can't drift apart. `what` is the image the copied
// prompt produces; `attach` is what has to be attached to that generation —
// the part that actually holds views consistent, and the part a label can't
// carry. Rendered by components/ui/PromptHint.
export type PromptHintText = { what: string; attach: string };

// Read mid-task by the person pasting a prompt into an image tool, so each is
// one short line. `attach` is called out separately in the tooltip because
// forgetting to re-attach the plan (or the approved view) is what silently
// breaks consistency — the prompt still generates, it just generates a
// different place.
// Takes spaceKind so the attach line names the same drawing the button does —
// "site plan" for an exterior, "floor plan" for an interior. A hint that says
// "plan" while the button says "Copy site plan" is one more thing to work out
// mid-task.
export function locationPromptHints(
  spaceKind: SpaceKind | null | undefined
): Record<"plan" | "view" | "sheet" | "angle", PromptHintText> {
  const plan = locationPlanLabel(spaceKind).toLowerCase();
  return {
    plan: {
      what: "Flat labelled diagram of the layout. Generate this first — layout errors show here and nowhere else.",
      attach: "Nothing to attach.",
    },
    view: {
      what: "One establishing view of this place — the reference every shot is generated against.",
      attach: `Re-attach the ${plan} image.`,
    },
    sheet: {
      what: "Every view in the VIEWS list as side-by-side panels of one image, so scale, light and materials can't disagree.",
      attach: `Re-attach the ${plan} image.`,
    },
    angle: {
      what: "One more view, as a camera move on the place you already approved. Fill in which VIEW to render.",
      attach: `Re-attach the approved view & the ${plan} image.`,
    },
  };
}

export type SystemPromptKind = keyof typeof SYSTEM_PROMPTS;
