import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireUser } from "@/lib/api/auth-guard";
import { mapStory } from "@/lib/api/map";

export async function GET() {
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("stories")
    .select("*, visual_styles!stories_visual_style_fk(name, description), chapters(count)")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const mapped = data.map((r) => ({
    ...mapStory(r),
    chapterCount: (r.chapters as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("stories")
    .insert({
      title: body.title || "Untitled Story",
      description: body.description ?? null,
      visual_style_id: body.visualStyleId ?? null,
      owner_id: user.id,
    })
    .select("*, visual_styles!stories_visual_style_fk(name, description)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapStory(data));
}
