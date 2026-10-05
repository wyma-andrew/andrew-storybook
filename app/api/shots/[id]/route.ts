import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapShot } from "@/lib/api/map";
import { isMotionMode } from "@/lib/constants/motion-styles";
import { isShotScale } from "@/lib/constants/shot-scales";

// Edits land in the *_override columns only — the generated prompt columns are
// never touched, so passing null for a field restores the original text.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = await supabaseRoute();
  const patch: Record<string, unknown> = {};
  if (body.prompt !== undefined) patch.prompt_override = body.prompt;
  if (body.videoPrompt !== undefined) patch.video_prompt_override = body.videoPrompt;
  if (body.soundPrompt !== undefined) patch.sound_prompt_override = body.soundPrompt;
  // Motion mode has no *_override counterpart: the generated value is a
  // classification, not text, and a hand-picked mode replaces it outright.
  // `emotional` in particular has no reliable automatic trigger, so setting it
  // by hand on the few shots that deserve it is the intended path.
  if (body.motionMode !== undefined) {
    if (!isMotionMode(body.motionMode)) return NextResponse.json({ error: "Invalid motion mode." }, { status: 400 });
    patch.motion_mode = body.motionMode;
  }
  // Shot scale, like motion mode, is a classification rather than text: a
  // hand-picked scale replaces the generated one outright, with no *_override.
  if (body.shotScale !== undefined) {
    if (!isShotScale(body.shotScale)) return NextResponse.json({ error: "Invalid shot scale." }, { status: 400 });
    patch.shot_scale = body.shotScale;
  }
  const { data, error } = await db.from("shots").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapShot(data));
}
