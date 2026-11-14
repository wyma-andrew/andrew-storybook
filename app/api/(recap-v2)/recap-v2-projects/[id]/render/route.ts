import { NextRequest } from "next/server";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { renderRecapV2 } from "@/lib/recap-v2-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "render",
    (project) => !project.units.length ? "Transcribe the video first."
      : project.units.some((unit) => !unit.muted && !unit.text.trim()) ? "Every line needs Burmese narration before rendering." : null,
    async (project, progress) => {
      const output = await renderRecapV2(project, progress);
      return { render_output_key: output.objectKey, render_output_url: output.url, render_srt_key: output.srtKey };
    });
}
