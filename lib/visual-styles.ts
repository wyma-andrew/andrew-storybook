import type { supabaseRoute } from "@/lib/supabase/route";
import { BUILT_IN_VISUAL_STYLES, type BuiltInVisualStyle } from "@/lib/constants/visual-styles";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

export type ResolvedVisualStyle = {
  id: string;
  name: string;
  description: string | null;
  swatch: string | null;
  locked: boolean;
};

function fromBuiltIn(style: BuiltInVisualStyle): ResolvedVisualStyle {
  return { ...style, locked: true };
}

export function findBuiltInVisualStyle(id: string | null | undefined) {
  return id ? BUILT_IN_VISUAL_STYLES.find((s) => s.id === id) : undefined;
}

// Resolves a single story's visual_style_id: built-in styles never touch the
// DB, anything else is looked up against the caller's own visual_styles rows
// (RLS-scoped via `db`).
export async function resolveVisualStyle(
  db: Db,
  id: string | null | undefined
): Promise<ResolvedVisualStyle | null> {
  if (!id) return null;
  const builtIn = findBuiltInVisualStyle(id);
  if (builtIn) return fromBuiltIn(builtIn);

  const { data } = await db.from("visual_styles").select("id, name, description, swatch").eq("id", id).single();
  if (!data) return null;
  return { id: data.id, name: data.name, description: data.description, swatch: data.swatch, locked: false };
}

// Batch variant for list endpoints — one query for every non-built-in id
// instead of N+1 per row.
export async function resolveVisualStyles(
  db: Db,
  ids: (string | null | undefined)[]
): Promise<Map<string, ResolvedVisualStyle>> {
  const result = new Map<string, ResolvedVisualStyle>();
  const dbIds = new Set<string>();

  for (const id of ids) {
    if (!id) continue;
    const builtIn = findBuiltInVisualStyle(id);
    if (builtIn) result.set(id, fromBuiltIn(builtIn));
    else dbIds.add(id);
  }

  if (dbIds.size) {
    const { data } = await db.from("visual_styles").select("id, name, description, swatch").in("id", Array.from(dbIds));
    for (const row of data ?? []) {
      result.set(row.id, { id: row.id, name: row.name, description: row.description, swatch: row.swatch, locked: false });
    }
  }

  return result;
}

// The effective style list a user sees: locked built-ins plus their own
// editable/removable rows.
export async function listVisualStyles(db: Db): Promise<ResolvedVisualStyle[]> {
  const { data } = await db.from("visual_styles").select("id, name, description, swatch").order("created_at");
  const own = (data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, swatch: r.swatch, locked: false }));
  return [...BUILT_IN_VISUAL_STYLES.map(fromBuiltIn), ...own];
}
