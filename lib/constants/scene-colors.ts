import type { CSSProperties } from "react";

// Scene accent colors. A scene's color is derived from its number, never from a
// hash or a random pick: scene 6 is the same color in every chapter and after a
// regeneration, so the badge is a stable landmark while scrolling.
//
// The hue is COMPUTED rather than picked from a list, because a fixed palette
// wraps — with eight entries scene 9 repeated scene 1.
//
// The whole wheel is used, not a narrow warm band: badges have to be told apart
// at a glance while scrolling, and a tight family of hues fails exactly that.
// Stepping by the golden angle puts every scene number on its own hue and keeps
// consecutive scenes as far apart as the wheel allows, for any scene count.
//
// Saturation and lightness are fixed and muted so that every hue, however far
// around the wheel, still sits at the same weight against the dark panel.
const GOLDEN_ANGLE = 137.508;
const SATURATION = 42;
const LIGHTNESS = 72;

/** Hue in degrees for a 1-based scene number. */
export function sceneHue(index: number): number {
  const step = Math.trunc(index) - 1;
  return (((step * GOLDEN_ANGLE) % 360) + 360) % 360;
}

// Handed to the element as custom properties rather than Tailwind classes with
// the color baked in: Tailwind only generates classes it finds spelled out in
// source, so a per-scene color can never be a generated class name. The classes
// stay static (`bg-(--scene-color)`) and only the variable moves.
export function sceneColorVars(index: number): CSSProperties {
  const hue = sceneHue(index);
  return { "--scene-color": `hsl(${hue.toFixed(2)} ${SATURATION}% ${LIGHTNESS}%)` } as CSSProperties;
}

/** Solid pill: the scene's hue behind near-black text. */
export const SCENE_BADGE_CLASS = "bg-(--scene-color) text-[#101010]";
/** Shot-number pill — the same solid fill as the badge, so a shot reads as the
 *  scene's at a glance. Only the size differs. */
export const SCENE_PILL_CLASS = SCENE_BADGE_CLASS;
