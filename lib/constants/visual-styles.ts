// Admin-predefined visual styles — internal-use project, no self-serve style
// editor. To add, edit, or remove a style, change this file directly (no DB,
// no "+ New style" UI).

import type { Region } from "./regions";

export interface VisualStylePreset {
  id: string; // stable slug — referenced by stories.visual_style_id
  name: string;
  swatch: string;
  description: string;
}

export const VISUAL_STYLES: VisualStylePreset[] = [
  {
    id: "3d-animation",
    name: "3D Animation",
    swatch: "#7ea8d8",
    description:
      "Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. Characters ignore the camera. Uncropped full frame, textless, no letterboxing.",
  },
];

export function findVisualStyle(id: string | null | undefined): VisualStylePreset | undefined {
  return id ? VISUAL_STYLES.find((s) => s.id === id) : undefined;
}

// Myanmar-only style override — NOT in VISUAL_STYLES (not user-pickable via
// the Visual Style selector). Separate wording from the shared "3D Animation"
// description, tuned for Myanmar-adapted content (clearly animated characters,
// reference-image consistency, no drift to photorealism). Swapped in wherever
// region === "myanmar", both at generation time and at copy time — English's
// "3D Animation" description is untouched.
const MYANMAR_STYLE_BASE =
  "Premium stylized 3D animated feature-film look with mildly realistic proportions and natural forms. Clearly animated characters in every frame, with smooth stylized skin, simplified facial detail, expressive animated eyes, and polished 3D character design. " +
  "Natural-looking environments and materials with controlled stylized detail. Soft cinematic lighting, gentle global illumination, subtle volumetric light, and rich natural colors. ";

// Only meaningful when the attached reference actually depicts this subject in
// the finished style — a character sheet, or a location's approved wide view.
// Attached to a location's FLOOR PLAN copy it backfires: it reads as "match the
// look of the schematic", which is how labelled, top-down plan artwork was
// coming back instead of a rendered room.
const MYANMAR_REFERENCE_CLAUSE =
  "Maintain the exact animated character design and visual style of the reference image throughout the entire shot. ";

const MYANMAR_STYLE_TAIL =
  "Never transition toward photorealism or live-action humans. No realistic human skin, pores, photographic faces, or live-action appearance. No video-game CGI.";

export const MYANMAR_STYLE_DESCRIPTION = MYANMAR_STYLE_BASE + MYANMAR_REFERENCE_CLAUSE + MYANMAR_STYLE_TAIL;

// `referenceImageAttached: false` drops the match-the-reference clause, for
// copies whose only attached image is a schematic rather than a render of the
// finished subject. A user-authored (non-Myanmar) style is returned as written
// — we can't know which of its sentences is the equivalent clause.
export function resolveStyleContext(
  region: Region,
  visualStyleDescription: string | null | undefined,
  { referenceImageAttached = true }: { referenceImageAttached?: boolean } = {}
): string | null {
  if (region !== "myanmar") return visualStyleDescription ?? null;
  return referenceImageAttached ? MYANMAR_STYLE_DESCRIPTION : MYANMAR_STYLE_BASE + MYANMAR_STYLE_TAIL;
}
