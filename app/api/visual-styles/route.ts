import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapVisualStyle } from "@/lib/api/map";

export async function GET(req: NextRequest) {
  const storyId = req.nextUrl.searchParams.get("storyId");
  const db = await supabaseRoute();
  let query = db.from("visual_styles").select("*").order("created_at");
  query = storyId ? query.or(`scope.eq.global,story_id.eq.${storyId}`) : query.eq("scope", "global");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapVisualStyle));
}

// storyId present -> story-owned custom style (RLS-enforced via supabaseRoute).
// storyId absent -> global built-in style, admin only (service role, bypasses RLS).
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.storyId) {
    const { unauthorized } = await requireAdmin();
    if (unauthorized) return unauthorized;
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("visual_styles")
      .insert({
        scope: "global",
        story_id: null,
        name: body.name,
        description: body.description ?? null,
        swatch: body.swatch ?? "#8a8a8a",
        source: "built_in",
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(mapVisualStyle(data));
  }

  const db = await supabaseRoute();
  const { data, error } = await db
    .from("visual_styles")
    .insert({
      scope: "story",
      story_id: body.storyId,
      name: body.name,
      description: body.description ?? null,
      swatch: body.swatch ?? "#8a8a8a",
      source: "custom",
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVisualStyle(data));
}
