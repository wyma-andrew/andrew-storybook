import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.realPrompt !== undefined) patch.real_prompt = body.realPrompt;
  if (body.name !== undefined) patch.name = body.name;
  if (body.meta !== undefined) patch.meta = body.meta;
  const { data, error } = await db.from("chapter_assets").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapChapterAsset(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { error } = await db.from("chapter_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
