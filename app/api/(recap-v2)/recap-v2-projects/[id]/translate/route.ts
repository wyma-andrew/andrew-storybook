import { NextRequest } from "next/server";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { buildRecapV2StoryContext, translateRecapV2Units } from "@/lib/recap-v2-translate";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "translate",
    (project) => !process.env.OPENAI_API_KEY ? "AI translation is not configured." : project.units.some((unit) => !unit.muted) ? null : "Transcribe the video first, and keep at least one line unmuted.",
    async (project, progress) => {
      progress("Reading the story", 0);
      const context = await buildRecapV2StoryContext(project.units.filter((unit) => !unit.muted), (done, total) => progress(`Reading the story ${done}/${total}`, 0.15 * done / total));
      progress(`Translating ${project.units.length} lines`, 0.15);
      const units = await translateRecapV2Units(project.units, context, (stage, done, total) => progress(stage, 0.15 + 0.85 * done / total));
      return { units, story_context: context };
    });
}
