import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapter } from "@/lib/api/map";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("chapters").select("*").eq("story_id", id).order("index");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapChapter));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = await supabaseRoute();

  const { data: existing, error: cntErr } = await db
    .from("chapters")
    .select("index")
    .eq("story_id", id)
    .order("index", { ascending: false })
    .limit(1);
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });
  const nextIndex = (existing[0]?.index ?? 0) + 1;

  const { data, error } = await db
    .from("chapters")
    .insert({
      story_id: id,
      index: nextIndex,
      title: body.title || `Episode ${nextIndex}`,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapChapter(data));
}
