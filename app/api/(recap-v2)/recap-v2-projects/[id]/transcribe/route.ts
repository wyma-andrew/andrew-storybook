import { NextRequest } from "next/server";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { transcribeRecapV2 } from "@/lib/recap-v2-transcribe";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "transcribe", () => null, async (project, progress) => {
    const { units, language } = await transcribeRecapV2(project, progress);
    return { units, detected_language: language, story_context: null, render_output_key: null, render_output_url: null, render_srt_key: null };
  });
}
