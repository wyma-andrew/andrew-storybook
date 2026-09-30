import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { supabaseRoute } from "@/lib/supabase/route";
import { deleteObject } from "@/lib/r2";
import { mapVoiceLabItem, validateVoiceLabText } from "@/lib/voice-lab";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const textError = validateVoiceLabText(body?.text);
  if (textError) return NextResponse.json({ error: textError }, { status: 400 });

  const db = await supabaseRoute();
  const { data: current, error: currentError } = await db.from("voice_lab_items").select("*").eq("id", id).single();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 });
  const text = (body.text as string).trim();
  if (text === current.text) return NextResponse.json(mapVoiceLabItem(current));

  const { data, error } = await db
    .from("voice_lab_items")
    .update({
      text,
      status: "pending",
      audio_key: null,
      audio_url: null,
      duration_seconds: null,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (current.audio_key) await deleteObject(current.audio_key).catch(() => undefined);
  return NextResponse.json(mapVoiceLabItem(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("voice_lab_items").delete().eq("id", id).select("audio_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await Promise.allSettled(data.filter((row) => row.audio_key).map((row) => deleteObject(row.audio_key)));
  return NextResponse.json(null);
}
