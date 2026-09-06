// Admin-predefined visual styles — internal-use project, no self-serve style
// editor. To add, edit, or remove a style, change this file directly (no DB,
// no "+ New style" UI).

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
