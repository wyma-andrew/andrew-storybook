import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapPromptLabRunSummary } from "@/lib/prompt-lab";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const { data, error } = await (await supabaseRoute())
    .from("prompt_lab_runs")
    .select("id, chapter_id, pass, asset_run_id, version_id, label, model, reasoning_effort, system_prompt_edited, user_prompt_edited, error, usage, latency_ms, output, created_at, scene_regen:context->sceneRegen")
    .eq("chapter_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapPromptLabRunSummary));
}
