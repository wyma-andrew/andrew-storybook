import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireUser } from "@/lib/api/auth-guard";
import { mapStory } from "@/lib/api/map";
import { resolveVisualStyle } from "@/lib/visual-styles";
import { importStoryBundle, parseStoryBundle } from "@/lib/story-transfer";

// Rebuilds an exported bundle as a new story owned by the signed-in user, so
// a story can move between accounts. The bundle is user-supplied JSON from
// another account entirely, so it is parsed defensively and every row is
// re-inserted with this user's ownership — nothing from the file selects an
// owner or an id.
export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 });
  }

  const payload = (body ?? {}) as { bundle?: unknown; title?: unknown };
  const parsed = parseStoryBundle(payload.bundle);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = await supabaseRoute();
  const result = await importStoryBundle(
    db,
    user!.id,
    parsed.bundle,
    typeof payload.title === "string" ? payload.title : null
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { data, error } = await db.from("stories").select("*").eq("id", result.storyId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const style = await resolveVisualStyle(data.visual_style_id);
  return NextResponse.json(mapStory(data, style));
}
