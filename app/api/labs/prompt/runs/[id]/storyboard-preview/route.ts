import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { loadPromptLabPreview } from "@/lib/prompt-lab-inputs";

// The storyboard preview with Known Assets taken from this extraction run
// instead of the chapter's stored assets.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: run, error } = await db.from("prompt_lab_runs").select("chapter_id").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const preview = await loadPromptLabPreview(db, run.chapter_id as string, "storyboard", id);
  if ("error" in preview) return NextResponse.json({ error: preview.error.message }, { status: preview.error.status });
  return NextResponse.json(preview);
}
