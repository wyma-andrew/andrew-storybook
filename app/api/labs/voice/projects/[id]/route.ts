import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { supabaseRoute } from "@/lib/supabase/route";
import { deleteObject } from "@/lib/r2";
import { getVoiceById } from "@/lib/tts/voices";
import { mapVoiceLabProject, validateVoiceLabProjectName } from "@/lib/voice-lab";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("voice_lab_projects").select("*, voice_lab_items(status)").eq("id", id).single();
  if (error) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapVoiceLabProject(data));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const update: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body?.name !== undefined) {
    const nameError = validateVoiceLabProjectName(body.name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    update.name = (body.name as string).trim();
  }
  if (body?.voiceId !== undefined) {
    if (!getVoiceById(body.voiceId)) return NextResponse.json({ error: "Choose a supported voice profile." }, { status: 400 });
    update.voice_id = body.voiceId;
  }

  const db = await supabaseRoute();
  const { data, error } = await db.from("voice_lab_projects").update(update).eq("id", id).select("*, voice_lab_items(status)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVoiceLabProject(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const db = await supabaseRoute();
  const { data: items, error: itemsError } = await db.from("voice_lab_items").select("audio_key").eq("project_id", id);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  const { error } = await db.from("voice_lab_projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await Promise.allSettled(items.filter((row) => row.audio_key).map((row) => deleteObject(row.audio_key)));
  return NextResponse.json(null);
}
