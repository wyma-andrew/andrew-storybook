import { NextRequest } from "next/server";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { resplitRecapV2 } from "@/lib/recap-v2-transcribe";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "transcribe", () => null, async (project, progress) => {
    progress("Re-splitting lines", null);
    return { units: await resplitRecapV2(project), story_context: null, render_output_key: null, render_output_url: null, render_srt_key: null };
  });
}
