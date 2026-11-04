import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { loadPromptLabPreview } from "@/lib/prompt-lab-inputs";
import { isPromptLabPass } from "@/lib/prompt-lab";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; pass: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id, pass } = await params;
  if (!isPromptLabPass(pass)) return NextResponse.json({ error: "Unknown pass" }, { status: 400 });
  const preview = await loadPromptLabPreview(await supabaseRoute(), id, pass);
  if ("error" in preview) return NextResponse.json({ error: preview.error.message }, { status: preview.error.status });
  return NextResponse.json(preview);
}
