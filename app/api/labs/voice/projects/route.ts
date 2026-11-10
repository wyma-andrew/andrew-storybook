import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapVoiceLabProject, validateVoiceLabProjectName } from "@/lib/voice-lab";

export const runtime = "nodejs";

export async function GET() {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const db = await supabaseRoute();
  const { data, error } = await db
    .from("voice_lab_projects")
    .select("*, voice_lab_items(status)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data.map(mapVoiceLabProject));
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const nameError = validateVoiceLabProjectName(body?.name);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

  const db = await supabaseRoute();
  const { data, error } = await db
    .from("voice_lab_projects")
    .insert({ owner_id: user!.id, name: (body.name as string).trim() })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapVoiceLabProject(data));
}
