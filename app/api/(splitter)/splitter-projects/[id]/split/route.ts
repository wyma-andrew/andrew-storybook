import { NextRequest } from "next/server";
import { runProjectJob } from "@/lib/recap-v2-job";
import { mapSplitterProject } from "@/lib/splitter";
import { renderSplitter } from "@/lib/splitter-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runProjectJob(await supabaseRoute(), "splitter_projects", id, mapSplitterProject, {}, () => null,
    async (project, progress) => ({ parts: await renderSplitter(project, progress) }));
}
