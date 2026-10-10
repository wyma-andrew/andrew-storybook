import { NextRequest } from "next/server";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { transcribeRecapV2 } from "@/lib/recap-v2-transcribe";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "transcribe", () => null, async (project, progress) => ({
    units: await transcribeRecapV2(project, progress),
    story_context: null,
    render_output_key: null,
    render_output_url: null,
  }));
}
