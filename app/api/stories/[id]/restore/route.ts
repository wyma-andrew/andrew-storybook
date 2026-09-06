import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapStory } from "@/lib/api/map";
import { resolveVisualStyle } from "@/lib/visual-styles";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("stories").update({ deleted_at: null }).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const style = await resolveVisualStyle(data.visual_style_id);
  return NextResponse.json(mapStory(data, style));
}
