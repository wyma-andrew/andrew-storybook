import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { cleanMotionOverrides, cleanOverrides, hasMotionOverrides, isPromptLabPass, mapPromptLabVersion } from "@/lib/prompt-lab";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pass: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { pass } = await params;
  if (!isPromptLabPass(pass)) return NextResponse.json({ error: "Unknown pass" }, { status: 400 });
  const { data, error } = await (await supabaseRoute())
    .from("prompt_lab_versions")
    .select("*")
    .eq("pass", pass)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapPromptLabVersion));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pass: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { pass } = await params;
  if (!isPromptLabPass(pass)) return NextResponse.json({ error: "Unknown pass" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; overrides?: unknown; motionOverrides?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const overrides = cleanOverrides(body?.overrides);
  const motionOverrides = cleanMotionOverrides(body?.motionOverrides);
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!overrides.length && !hasMotionOverrides(motionOverrides)) {
    return NextResponse.json({ error: "No edited blocks to save" }, { status: 400 });
  }
  const { data, error } = await (await supabaseRoute())
    .from("prompt_lab_versions")
    .insert({ pass, name, overrides, motion_overrides: motionOverrides })
    .select("*")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? `A version named "${name}" already exists.` : error.message }, { status });
  }
  return NextResponse.json(mapPromptLabVersion(data));
}
