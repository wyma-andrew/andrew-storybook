import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireUser } from "@/lib/api/auth-guard";
import { mapStory } from "@/lib/api/map";
import { resolveVisualStyle, resolveVisualStyles } from "@/lib/visual-styles";

export async function GET() {
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("stories")
    .select("*, chapters(count)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const styles = await resolveVisualStyles(data.map((r) => r.visual_style_id as string | null));
  const mapped = data.map((r) => ({
    ...mapStory(r, styles.get((r.visual_style_id as string) ?? "") ?? null),
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
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const style = await resolveVisualStyle(data.visual_style_id);
  return NextResponse.json(mapStory(data, style));
}
