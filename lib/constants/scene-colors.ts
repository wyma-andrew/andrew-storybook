// Scene accent colors. A scene's color is derived from its number, never from a
// hash or a random pick: scene 6 is the same color in every chapter and after a
// regeneration, so the badge is a stable landmark while scrolling rather than
// decoration that shifts under the reader.
//
// Class strings are written out in full because Tailwind scans source for
// literal class names — a composed `bg-[${hex}]` would never be generated.
export type SceneColor = {
  /** Solid pill: badge background + the dark text that stays legible on it. */
  badge: string;
  /** The same hue as foreground, for plain text. */
  text: string;
  /** Tinted pill for the shot number — the scene's hue, quieter than `badge`. */
  pill: string;
};

// Muted hues chosen against the dark panel; the first is the theme accent, so
// single-scene chapters look exactly as they did before.
export const SCENE_COLORS: SceneColor[] = [
  { badge: "bg-[#e8e2d4] text-[#101010]", text: "text-[#e8e2d4]", pill: "bg-[#e8e2d4]/12 text-[#e8e2d4] ring-1 ring-inset ring-[#e8e2d4]/30" },
  { badge: "bg-[#d9b978] text-[#101010]", text: "text-[#d9b978]", pill: "bg-[#d9b978]/12 text-[#d9b978] ring-1 ring-inset ring-[#d9b978]/30" },
  { badge: "bg-[#8fb99a] text-[#101010]", text: "text-[#8fb99a]", pill: "bg-[#8fb99a]/12 text-[#8fb99a] ring-1 ring-inset ring-[#8fb99a]/30" },
  { badge: "bg-[#8fa8c9] text-[#101010]", text: "text-[#8fa8c9]", pill: "bg-[#8fa8c9]/12 text-[#8fa8c9] ring-1 ring-inset ring-[#8fa8c9]/30" },
  { badge: "bg-[#c9a3c4] text-[#101010]", text: "text-[#c9a3c4]", pill: "bg-[#c9a3c4]/12 text-[#c9a3c4] ring-1 ring-inset ring-[#c9a3c4]/30" },
  { badge: "bg-[#e0a08a] text-[#101010]", text: "text-[#e0a08a]", pill: "bg-[#e0a08a]/12 text-[#e0a08a] ring-1 ring-inset ring-[#e0a08a]/30" },
  { badge: "bg-[#9fc7c2] text-[#101010]", text: "text-[#9fc7c2]", pill: "bg-[#9fc7c2]/12 text-[#9fc7c2] ring-1 ring-inset ring-[#9fc7c2]/30" },
  { badge: "bg-[#c2c48f] text-[#101010]", text: "text-[#c2c48f]", pill: "bg-[#c2c48f]/12 text-[#c2c48f] ring-1 ring-inset ring-[#c2c48f]/30" },
];

/** `index` is the 1-based scene number; colors cycle past the palette's length. */
export function sceneColor(index: number): SceneColor {
  const position = (Math.trunc(index) - 1) % SCENE_COLORS.length;
  return SCENE_COLORS[position < 0 ? position + SCENE_COLORS.length : position];
}
