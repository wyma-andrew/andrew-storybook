import { NextRequest } from "next/server";
import { GEMINI_NOT_CONFIGURED, geminiConfigured } from "@/lib/gemini";
import { runRecapV2Job } from "@/lib/recap-v2-job";
import { buildRecapV2StoryContext, translateRecapV2Units } from "@/lib/recap-v2-translate";
import { recapV2LanguageName } from "@/lib/recap-v2";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runRecapV2Job(await supabaseRoute(), id, "translate",
    (project) => !geminiConfigured() ? GEMINI_NOT_CONFIGURED : project.units.some((unit) => !unit.muted) ? null : "Transcribe the video first, and keep at least one line unmuted.",
    async (project, progress) => {
      const language = recapV2LanguageName(project.detectedLanguage ?? (project.sourceLanguage === "auto" ? "zh" : project.sourceLanguage));
      progress("Reading the story", 0);
      const context = await buildRecapV2StoryContext(project.units.filter((unit) => !unit.muted), language, (done, total) => progress(`Reading the story ${done}/${total}`, 0.15 * done / total));
      progress(`Translating ${project.units.length} lines`, 0.15);
      const units = await translateRecapV2Units(project.units, language, context, (stage, done, total) => progress(stage, 0.15 + 0.85 * done / total));
      return { units, story_context: context };
    });
}
