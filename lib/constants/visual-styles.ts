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

// Same wording used for all three regions, same as Mythic Fantasy Painting's
// english/myanmar duplication — the style is already Buddha-era in subject, so
// there is nothing region-specific to adapt yet.
const BUDDHA_ERA_3D_BASE =
  "Premium stylized 3D animated feature-film look, with clean sculpted forms, refined materials and textures, balanced natural colors, subtle atmospheric depth, and polished high-end rendering. Clearly animated and non-photorealistic. " +
  "Ancient South Asian Buddha-era aesthetic, historically grounded, peaceful, dignified, natural, and serene, with a restrained sacred atmosphere inspired by early Buddhist life and culture. Maintain believable proportions, natural forms, historically appropriate architecture, clothing, tools, furnishings, and materials while preserving a refined animated-film appearance. " +
  "Favor simple hand-crafted materials such as natural wood, clay, stone, woven reed, handwoven fabric, packed earth, and other period-appropriate surfaces. Keep environments organic, hand-built, and lived-in rather than ornate or fantastical, with detailing and finish restrained. The size, building count, and grandeur of a place follow the story and the place itself, not a default of smallness. " +
  // Light QUALITY only — how light behaves in this style. The scene's actual
  // light (hour, source, warmth) is the scene's [Lighting] line, composed at
  // copy time; naming an hour here contradicts every night or lamp-lit scene.
  "Render light softly and naturally: gentle ambient illumination, controlled highlights, natural shadows, balanced contrast, and subtle atmospheric depth. The overall image should feel calm, contemplative, culturally grounded, and visually coherent without becoming overly mystical. " +
  "Avoid dramatic fantasy lighting, divine beams, excessive golden glow, artificial halos made of light, magical particles, hyper-real textures or skin, live-action realism, plastic toy appearance, exaggerated cartoon proportions, anime styling, overly decorative fantasy elements, luxurious modern-looking materials, or excessive visual effects.";

// Rendering only. The POV framing, the cottage, and the rainy morning from the
// cozy-ASMR reference belong to the shot, the location asset, and the scene's
// [Lighting] line — a style naming them would fight every other story.
const COZY_ANIME_BASE =
  "Cozy hand-drawn anime-inspired illustration in the tradition of classic 2D animated feature films. Clean confident linework, soft cel shading, and richly detailed hand-painted backgrounds with visible gouache and watercolor texture. " +
  "Warm, earthy, gently desaturated palette — wood browns, moss greens, cream, and muted terracotta — with a nostalgic, peaceful slice-of-life mood. " +
  "Everyday objects, food, utensils, and natural materials are drawn with loving, tactile detail: wood grain, ceramic glaze, woven cloth, water, steam, and fresh produce read clearly and appetizingly. " +
  "Render light softly and naturally: gentle ambient illumination, soft painted shadows, delicate atmospheric depth. " +
  "Clearly illustrated and non-photorealistic. Avoid 3D rendering, CGI, photographic textures, harsh contrast, neon or oversaturated color, glossy plastic surfaces, and chibi or exaggerated cartoon proportions. ";

// Rendering only, distilled from a Buddha sermon reference. That prompt's face,
// age, earlobes, gesture, Sarnath grove, and morning light belong to the
// character asset, the shot, the location, and the scene's [Lighting] line —
// in the style they would restyle every character as the Buddha.
const SACRED_HISTORICAL_DRAMA_BASE =
  "Ultra photorealistic live-action cinematic still, shot like a premium historical drama film. Every figure is a real human being with natural, realistic skin texture, never a statue, painting, wax figure, or 3D render. " +
  "Ancient South Asian Buddha-era setting, historically grounded, with period-appropriate clothing and robes showing realistic woven texture and natural folds, hand-crafted materials, and natural environments. Sacred, tranquil, reverent atmosphere. " +
  "Render light naturally: soft, believable illumination with gentle highlights and realistic shadows. " +
  "Avoid cartoon, anime, painterly or illustrated looks, CGI, plastic or waxy skin, exaggerated halos, fantasy costumes, distorted hands, and extra fingers. ";

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
      // The historical setting comes from buddhaAdaptationBlock; this explicit
      // entry controls only its rendering style and deliberately does not fall
      // back to another region.
      buddha: {
        base:
          "Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
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
          "Hyper-realistic mythic fantasy digital painting with refined cinematic realism, controlled dramatic lighting, soft chiaroscuro, rich depth, detailed natural textures, painterly brushwork blended with realistic rendering, a sacred Southeast Asian Buddhist-inspired aesthetic, warm golden highlights balanced with cool blue shadows, elegant atmosphere, high-detail concept-art quality, immersive and serene visual tone. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
      // Same wording as English for now — the style is already Southeast Asian
      // in subject, so there is nothing to adapt yet. Duplicated rather than
      // shared so a Myanmar-specific edit later touches only this block.
      myanmar: {
        base:
          "Hyper-realistic mythic fantasy digital painting with refined cinematic realism, controlled dramatic lighting, soft chiaroscuro, rich depth, detailed natural textures, painterly brushwork blended with realistic rendering, a sacred Southeast Asian Buddhist-inspired aesthetic, warm golden highlights balanced with cool blue shadows, elegant atmosphere, high-detail concept-art quality, immersive and serene visual tone. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
      // This rendering text names the Buddha-era aesthetic explicitly; the
      // shared adaptation block still owns detailed historical content rules.
      buddha: {
        base:
          "Premium stylized mythic fantasy digital painting with cinematic lighting, soft chiaroscuro, rich depth, elegant painterly brushwork, detailed but controlled textures, a sacred ancient South Asian Buddha-era aesthetic, warm golden highlights balanced with cool blue shadows, atmospheric and serene mood, high-end concept-art illustration quality, visually immersive, clearly stylized and non-photorealistic. Maintain believable anatomy and material detail, but avoid live-action realism and photographic appearance. " +
          SINGLE_FRAME_TAIL,
        referenceClause: "",
        tail: "",
      },
    },
  },
  {
    id: "buddha-era-3d",
    name: "Buddha Era 3D",
    swatch: "#a8895f",
    text: {
      english: {
        base: BUDDHA_ERA_3D_BASE,
        referenceClause: "",
        tail: SINGLE_FRAME_TAIL,
      },
      myanmar: {
        base: BUDDHA_ERA_3D_BASE,
        referenceClause: "",
        tail: "",
      },
      buddha: {
        base: BUDDHA_ERA_3D_BASE,
        referenceClause: "",
        tail: "",
      },
    },
  },
  {
    id: "cozy-hand-drawn-anime",
    name: "Cozy Hand-drawn Anime",
    swatch: "#9bb07a",
    text: {
      english: { base: COZY_ANIME_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
      myanmar: { base: COZY_ANIME_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
      buddha: { base: COZY_ANIME_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
    },
  },
  {
    id: "sacred-historical-drama",
    name: "Sacred Historical Drama",
    swatch: "#c98a3c",
    text: {
      english: { base: SACRED_HISTORICAL_DRAMA_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
      myanmar: { base: SACRED_HISTORICAL_DRAMA_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
      buddha: { base: SACRED_HISTORICAL_DRAMA_BASE + SINGLE_FRAME_TAIL, referenceClause: "", tail: "" },
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
