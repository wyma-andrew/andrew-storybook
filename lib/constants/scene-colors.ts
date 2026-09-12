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
// Saturation and lightness are NOT set here: they come from --scene-s/--scene-l
// in app/globals.css, because the weight a badge needs depends on the theme it
// sits in — a 72% fill reads on the dark panel and washes out on the light one.
// Only the hue is a property of the scene.
const GOLDEN_ANGLE = 137.508;

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
  return { "--scene-hue": sceneHue(index).toFixed(2) } as CSSProperties;
}

/** Solid pill: the scene's hue behind text the theme picks for contrast. */
export const SCENE_BADGE_CLASS = "bg-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l))] text-(--scene-fg)";
/** Shot-number pill — the same solid fill as the badge, so a shot reads as the
 *  scene's at a glance. Only the size differs. */
export const SCENE_PILL_CLASS = SCENE_BADGE_CLASS;

/** Open scene header: the scene's hue as a wash, weak enough to read as a tint. */
export const SCENE_SURFACE_CLASS = "bg-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l)_/_0.12)]";
/** Open scene card outline, in the same hue as its badge. */
export const SCENE_BORDER_CLASS = "border-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l)_/_0.5)]";
/** Quiet chip inside a scene header (shot count): the hue, at label weight. */
export const SCENE_CHIP_CLASS =
  "border-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l)_/_0.35)] bg-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l)_/_0.1)] text-[hsl(var(--scene-hue)_var(--scene-s)_var(--scene-l))]";
