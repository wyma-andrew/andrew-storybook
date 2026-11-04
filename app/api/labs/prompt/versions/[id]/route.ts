import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { cleanMotionOverrides, cleanOverrides, hasMotionOverrides, mapPromptLabVersion } from "@/lib/prompt-lab";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown; overrides?: unknown; motionOverrides?: unknown } | null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body?.overrides !== undefined || body?.motionOverrides !== undefined) {
    const overrides = cleanOverrides(body.overrides);
    const motionOverrides = cleanMotionOverrides(body.motionOverrides);
    if (!overrides.length && !hasMotionOverrides(motionOverrides)) {
      return NextResponse.json({ error: "No edited blocks to save" }, { status: 400 });
    }
    patch.overrides = overrides;
    patch.motion_overrides = motionOverrides;
  }
  const { data, error } = await (await supabaseRoute())
    .from("prompt_lab_versions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json(mapPromptLabVersion(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const { error } = await (await supabaseRoute()).from("prompt_lab_versions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
