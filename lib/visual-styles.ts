import { VISUAL_STYLES, findVisualStyle } from "@/lib/constants/visual-styles";

// What a story payload carries about its style: enough to label it in the UI.
// The prompt text is not here — it is per-region, and picking a region's text
// is resolveStyleContext's job, from the style id.
export type ResolvedVisualStyle = {
  id: string;
  name: string;
  swatch: string | null;
};

// Any id that doesn't resolve (unset, or a leftover reference from before
// styles moved into code) falls back to VISUAL_STYLES[0] rather than "no
// style", so every story keeps working the way it did before. Now that more
// than one style exists this fallback silently picks 3D Animation for a story
// whose style was never set — it should give way to a real "unset" state.
function resolveOrDefault(id: string | null | undefined) {
  return findVisualStyle(id) ?? VISUAL_STYLES[0];
}

function toResolved({ id, name, swatch }: { id: string; name: string; swatch: string }): ResolvedVisualStyle {
  return { id, name, swatch };
}

export function resolveVisualStyle(id: string | null | undefined): ResolvedVisualStyle | null {
  const style = resolveOrDefault(id);
  return style ? toResolved(style) : null;
}

export function resolveVisualStyles(ids: (string | null | undefined)[]): Map<string, ResolvedVisualStyle> {
  const result = new Map<string, ResolvedVisualStyle>();
  for (const id of ids) {
    const key = id ?? "";
    if (result.has(key)) continue;
    const style = resolveOrDefault(id);
    if (style) result.set(key, toResolved(style));
  }
  return result;
}

export function listVisualStyles(): ResolvedVisualStyle[] {
  return VISUAL_STYLES.map(toResolved);
}
