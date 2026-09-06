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
// description, tuned for Myanmar-adapted content (real materials/textures
// like teak wood, corrugated metal, packed earth). Swapped in wherever
// region === "myanmar", both at generation time and at copy time — English's
// "3D Animation" description is untouched.
export const MYANMAR_STYLE_DESCRIPTION =
  "Premium stylized 3D animated feature-film aesthetic, clearly animated rather than photoreal — think modern Pixar/DreamWorks-style theatrical animation, not a photoreal render or video-game cutscene. Appealing character and environment design with softly rounded forms, gently simplified shapes, and pleasingly exaggerated proportions. Smooth stylized surfaces and materials with clean, simplified detail — never flat or paper-cutout, but never approaching real-world material fidelity either. " +
  "Warm cinematic lighting, soft global illumination, gentle volumetric light, vibrant natural colors, and a polished animated-feature-film visual quality. " +
  "Avoid photorealism, realistic photography, hyper-realistic or ultra-fine material rendering (skin pores, wood grain, fabric weave), real-world lighting simulation, and live-action appearance. Uncropped full frame, textless, no letterboxing.";

export function resolveStyleContext(region: Region, visualStyleDescription: string | null | undefined): string | null {
  return region === "myanmar" ? MYANMAR_STYLE_DESCRIPTION : (visualStyleDescription ?? null);
}
