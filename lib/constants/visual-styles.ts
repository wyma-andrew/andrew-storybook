// Admin-predefined visual styles (global built-ins). Was the DB-backed
// `visual_styles` table rows with scope='global', source='built_in' —
// extracted here verbatim from the live row(s). Locked: not user-editable
// or removable. To change these, edit this file directly.
//
// `id` is a stable slug (not a uuid) so app code can address a built-in
// style the same way it addresses a user-created (DB) style.

export interface BuiltInVisualStyle {
  id: string;
  name: string;
  description: string;
  swatch: string;
}

export const BUILT_IN_VISUAL_STYLES: BuiltInVisualStyle[] = [
  {
    id: "3d-animation",
    name: "3D Animation",
    description:
      "Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. Characters ignore the camera. Uncropped full frame, textless, no letterboxing.",
    swatch: "#7ea8d8",
  },
];
