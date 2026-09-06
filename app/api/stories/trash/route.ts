import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapStory } from "@/lib/api/map";
import { resolveVisualStyles } from "@/lib/visual-styles";

export async function GET() {
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("stories")
    .select("*, chapters(count)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const styles = await resolveVisualStyles(data.map((r) => r.visual_style_id as string | null));
  const mapped = data.map((r) => ({
    ...mapStory(r, styles.get((r.visual_style_id as string) ?? "") ?? null),
    chapterCount: (r.chapters as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
  return NextResponse.json(mapped);
}
