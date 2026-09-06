import { VISUAL_STYLES, findVisualStyle } from "@/lib/constants/visual-styles";

export type ResolvedVisualStyle = {
  id: string;
  name: string;
  description: string | null;
  swatch: string | null;
};

// Only one style exists for now (VISUAL_STYLES[0]) — every story effectively
// uses the same one. Any id that doesn't resolve (unset, or a leftover
// reference from before styles moved into code) falls back to it rather
// than "no style", so every story keeps working the way it did before.
// Once there's more than one style, this fallback should go away in favor
// of a real "unset" state.
function resolveOrDefault(id: string | null | undefined) {
  return findVisualStyle(id) ?? VISUAL_STYLES[0];
}

export function resolveVisualStyle(id: string | null | undefined): ResolvedVisualStyle | null {
  const style = resolveOrDefault(id);
  return style ? { ...style } : null;
}

export function resolveVisualStyles(ids: (string | null | undefined)[]): Map<string, ResolvedVisualStyle> {
  const result = new Map<string, ResolvedVisualStyle>();
  for (const id of ids) {
    const key = id ?? "";
    if (result.has(key)) continue;
    const style = resolveOrDefault(id);
    if (style) result.set(key, { ...style });
  }
  return result;
}

export function listVisualStyles(): ResolvedVisualStyle[] {
  return VISUAL_STYLES.map((s) => ({ ...s }));
}
