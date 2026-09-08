// Admin-predefined boilerplate stitched onto character/location asset prompts
// at copy time (see lib/prompt-copy.ts withAssetContext). Was the DB-backed
// `system_prompts` table (kind='character' | 'location') — extracted here
// verbatim from the live rows. To change these, edit this file directly.

export const SYSTEM_PROMPTS = {
  character:
    "Character reference sheet: full-body turnaround, front view / 3-quarter view / side view / back view, neutral standing pose, arranged left to right, consistent scale and studio lighting across all views, plain neutral background, no props or background elements. Maintain exact facial structure, hairstyle, and wardrobe identically across every view and every future generation of this character. No text, captions, labels, watermarks, or UI overlays anywhere in the image.",
  location:
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
} as const;

export type SystemPromptKind = keyof typeof SYSTEM_PROMPTS;
