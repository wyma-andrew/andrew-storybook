// Per-shot framing scale (shots.shot_scale) and the optics line it selects.
//
// Same split as motion styles: the AI never writes this text. It tags a shot
// with one scale, and the app composes the line below into the copied prompt
// at copy time (lib/prompt-copy.ts) — so the wording can be edited here and
// every existing shot copies differently with no regeneration.
//
// Why it cannot live in the visual style: depth of field is the one look
// property that must DISAGREE between shots. An establishing wide needs the
// whole space legible; an extreme close-up needs the background dissolved. A
// story-wide style string applied to both flattens them into the same image.
// The lines below describe optics only — never lighting (that is the scene's
// [Lighting] line) and never subject or place (that is the shot prompt).

export type ShotScale = "wide" | "medium" | "close" | "extreme-close";

export const SHOT_SCALES: ShotScale[] = ["wide", "medium", "close", "extreme-close"];

export const DEFAULT_SHOT_SCALE: ShotScale = "medium";

export interface ShotScaleOption {
  value: ShotScale;
  label: string;
  hint: string;
  // Composed into the copied prompt behind a [Framing] marker.
  optics: string;
}

// Perspective, not subject: with the camera at standing eye level, every
// standing adult's head lands on the horizon whatever their distance. Without
// it a wide shot scaled the attached character sheet up and the townspeople
// down, so the lead stood a head taller than everyone around him.
const HUMAN_SCALE =
  " Eye-level camera: every adult standing on the camera's ground level has their head on the same horizon line, near or far, and anyone on a raised place (a roof, a wall, a rock) sits higher by that height alone — people are larger only because they are closer, never because they matter more, and the main character is the same normal adult height as the people around them, feet planted firmly on the ground.";

export const SHOT_SCALE_OPTIONS: ShotScaleOption[] = [
  {
    value: "wide",
    label: "Wide",
    hint: "Establishing, full space legible",
    optics:
      "Wide framing with deep focus — the whole space readable front to back, soft natural depth of field, background structures and their relative positions clearly legible, no background blur." + HUMAN_SCALE,
  },
  {
    value: "medium",
    label: "Medium",
    hint: "Waist-up, character action",
    optics:
      "Medium framing with soft natural depth of field — the subject sharp, the environment behind them gently softened but still readable as the place it is.",
  },
  {
    value: "close",
    label: "Close",
    hint: "Face or hands fill the frame",
    optics:
      "Close framing with shallow natural depth of field — the subject sharp and dominant in frame, the background softly blurred into broad organic shapes.",
  },
  {
    value: "extreme-close",
    label: "Extreme close",
    hint: "Detail, texture, object in hand",
    optics:
      "Extreme close framing with heavy soft natural depth of field — surface texture and micro-detail sharp, the background dissolved into a blurred organic wash.",
  },
];

export function isShotScale(value: unknown): value is ShotScale {
  return typeof value === "string" && SHOT_SCALES.includes(value as ShotScale);
}

// Rows predating the column, and any value the model invents, fall back to the
// neutral middle rather than failing — a wrong-but-plausible framing line beats
// no framing line, and the user can change the scale on the shot.
export function resolveShotScale(value: unknown): ShotScale {
  return isShotScale(value) ? value : DEFAULT_SHOT_SCALE;
}

export function findShotScale(value: unknown): ShotScaleOption {
  const scale = resolveShotScale(value);
  return SHOT_SCALE_OPTIONS.find((option) => option.value === scale)!;
}

// Null only when the shot has no stored scale at all — an un-scaled shot keeps
// copying exactly as it did before this feature, rather than inheriting the
// default's optics wording it was never written for.
export function resolveShotOptics(value: unknown): string | null {
  return isShotScale(value) ? findShotScale(value).optics : null;
}
