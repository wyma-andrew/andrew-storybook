import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapBibleEntry } from "@/lib/api/map";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.realPrompt !== undefined) patch.real_prompt = body.realPrompt;
  if (body.locked !== undefined) patch.locked = body.locked;
  if (body.name !== undefined) patch.name = body.name;
  if (body.meta !== undefined) patch.meta = body.meta;
  const { data, error } = await db.from("bible_entries").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapBibleEntry(data));
}
