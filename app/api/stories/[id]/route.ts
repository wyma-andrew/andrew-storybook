import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapStory, mapChapter } from "@/lib/api/map";
import { resolveVisualStyle } from "@/lib/visual-styles";
import { isRegion } from "@/lib/constants/regions";
import { MOTION_STYLES } from "@/lib/constants/motion-styles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const [{ data: story, error: sErr }, { data: chapters, error: cErr }] = await Promise.all([
    db.from("stories").select("*").eq("id", id).is("deleted_at", null).single(),
    db.from("chapters").select("*").eq("story_id", id).order("index"),
  ]);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 404 });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const style = await resolveVisualStyle(story.visual_style_id);
  return NextResponse.json({ ...mapStory(story, style), chapters: chapters.map(mapChapter) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.visualStyleId !== undefined) patch.visual_style_id = body.visualStyleId;
  if (body.aspectRatio !== undefined) patch.aspect_ratio = body.aspectRatio;
  if (body.region !== undefined) {
    if (!isRegion(body.region)) return NextResponse.json({ error: "Invalid region." }, { status: 400 });
    patch.region = body.region;
  }
  if (body.motionStyleId !== undefined) {
    if (!MOTION_STYLES.some((s) => s.id === body.motionStyleId)) {
      return NextResponse.json({ error: "Invalid motion style." }, { status: 400 });
    }
    patch.motion_style_id = body.motionStyleId;
  }
  const { data, error } = await db.from("stories").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const style = await resolveVisualStyle(data.visual_style_id);
  return NextResponse.json(mapStory(data, style));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { error } = await db.from("stories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
