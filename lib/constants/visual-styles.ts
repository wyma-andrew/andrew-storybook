// Admin-predefined visual styles — internal-use project, no self-serve style
// editor. To add, edit, or remove a style, change this file directly (no DB,
// no "+ New style" UI).

import type { Region } from "./regions";

// Every style carries one text per region. The shape is fixed: a region never
// falls back to another region's wording, because a fallback is what let the
// Myanmar text written for 3D Animation ("never transition toward
// photorealism") attach itself to a photorealistic painting style. Two regions
// that genuinely want the same wording duplicate it here — that is cheaper
// than a rule about when the fallback applies.
export interface StyleText {
  // Always included.
  base: string;
  // Only meaningful when the attached reference actually depicts this subject
  // in the finished style — a character sheet, or a location's approved wide
  // view. On a location's FLOOR PLAN copy it backfires: it reads as "match the
  // look of the schematic", which is how labelled, top-down plan artwork came
  // back instead of a rendered room. Dropped when referenceImageAttached is
  // false. Empty string when the style has no such clause.
  referenceClause: string;
  // Always included, after the clause. Empty string when unused.
  tail: string;
}

export interface VisualStylePreset {
  id: string; // stable slug — referenced by stories.visual_style_id
  name: string;
  swatch: string;
  text: Record<Region, StyleText>;
}

// The copy targets are single frames — without this tail the renders come back
// letterboxed or captioned. Every English text carries it.
const SINGLE_FRAME_TAIL = "Characters ignore the camera. Uncropped full frame, textless, no letterboxing.";

export const VISUAL_STYLES: VisualStylePreset[] = [
  {
    id: "3d-animation",
    name: "3D Animation",
    swatch: "#7ea8d8",
    text: {
      english: {
        base:
          "Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
      // Tuned for Myanmar-adapted content: clearly animated characters,
      // reference-image consistency, no drift to photorealism. Deliberately
      // different wording from the English text, not a translation of it.
      myanmar: {
        base:
          "Premium stylized 3D animated feature-film look with mildly realistic proportions and natural forms. Clearly animated characters in every frame, with smooth stylized skin, simplified facial detail, expressive animated eyes, and polished 3D character design. " +
          "Natural-looking environments and materials with controlled stylized detail. Soft cinematic lighting, gentle global illumination, subtle volumetric light, and rich natural colors. ",
        referenceClause:
          "Maintain the exact animated character design and visual style of the reference image throughout the entire shot. ",
        tail: "Never transition toward photorealism or live-action humans. No realistic human skin, pores, photographic faces, or live-action appearance. No video-game CGI.",
      },
    },
  },
  {
    id: "mythic-fantasy-painting",
    name: "Mythic Fantasy Painting",
    swatch: "#d3a34a",
    text: {
      english: {
        base:
          "Hyper-realistic digital fantasy painting, cinematic dramatic lighting with strong chiaroscuro contrast between darkness and golden light, intricate detailed textures on fabric and skin, mythological Buddhist-Hindu aesthetic, volumetric light rays, particle effects (glowing embers, flower petals), rich warm gold and cool blue color palette, 8K ultra-detailed rendering, epic scale composition, painterly brushwork blended with photorealistic elements, inspired by traditional Southeast Asian Buddhist iconography combined with modern concept-art illustration style. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
      // Same wording as English for now — the style is already Southeast Asian
      // in subject, so there is nothing to adapt yet. Duplicated rather than
      // shared so a Myanmar-specific edit later touches only this block.
      myanmar: {
        base:
          "Hyper-realistic digital fantasy painting, cinematic dramatic lighting with strong chiaroscuro contrast between darkness and golden light, intricate detailed textures on fabric and skin, mythological Buddhist-Hindu aesthetic, volumetric light rays, particle effects (glowing embers, flower petals), rich warm gold and cool blue color palette, 8K ultra-detailed rendering, epic scale composition, painterly brushwork blended with photorealistic elements, inspired by traditional Southeast Asian Buddhist iconography combined with modern concept-art illustration style. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
    },
  },
];

export function findVisualStyle(id: string | null | undefined): VisualStylePreset | undefined {
  return id ? VISUAL_STYLES.find((s) => s.id === id) : undefined;
}

// An id that doesn't resolve (unset, or a leftover reference from before styles
// moved into code) falls back to VISUAL_STYLES[0], so that entry must stay
// first — reordering silently restyles every story whose style was never set.
function resolveOrDefault(id: string | null | undefined): VisualStylePreset | undefined {
  return findVisualStyle(id) ?? VISUAL_STYLES[0];
}

// The style context injected into every generated and copied prompt. Takes the
// style id rather than a description string so the region's own text is picked
// here — a caller holding one already-flattened description cannot know which
// region it was written for.
//
// `referenceImageAttached: false` drops the match-the-reference clause, for
// copies whose only attached image is a schematic rather than a render of the
// finished subject.
export function resolveStyleContext(
  region: Region,
  visualStyleId: string | null | undefined,
  { referenceImageAttached = true }: { referenceImageAttached?: boolean } = {}
): string | null {
  const style = resolveOrDefault(visualStyleId);
  if (!style) return null;
  const text = style.text[region];
  return text.base + (referenceImageAttached ? text.referenceClause : "") + text.tail;
}
