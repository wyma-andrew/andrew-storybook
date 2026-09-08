import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapShot } from "@/lib/api/map";

// Edits land in the *_override columns only — the generated prompt columns are
// never touched, so passing null for a field restores the original text.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = {};
  if (body.prompt !== undefined) patch.prompt_override = body.prompt;
  if (body.videoPrompt !== undefined) patch.video_prompt_override = body.videoPrompt;
  const { data, error } = await db.from("shots").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapShot(data));
}
