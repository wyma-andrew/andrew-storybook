import { NextRequest, NextResponse } from "next/server";
import { episodeProject } from "@/lib/movie-recap-episode";
import { loadMovieRecapTarget, movieRecapTargetResponse } from "@/lib/movie-recap-episode-target";
import { rebuildMovieRecapBeats } from "@/lib/movie-recap-script";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const edits = Array.isArray(body?.edits)
    ? body.edits.map((edit: { index?: unknown; text?: unknown }) => ({
      index: Number(edit?.index),
      text: typeof edit?.text === "string" ? edit.text : "",
    }))
    : [];
  if (!edits.length || edits.some((edit: { index: number }) => !Number.isInteger(edit.index) || edit.index < 0)) {
    return NextResponse.json({ error: "Which beats?" }, { status: 400 });
  }

  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const { episode } = target;
  const project = episode ? episodeProject(target.project, episode) : target.project;
  if (project.scriptStatus === "running" || project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the run in progress to finish." }, { status: 409 });
  }

  let failed: number[];
  try {
    ({ failed } = await rebuildMovieRecapBeats(db, project, edits, episode?.id ?? null, req.signal));
  } catch (rebuildError) {
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    return NextResponse.json(
      { error: rebuildError instanceof Error ? rebuildError.message : "Could not rebuild those beats." },
      { status: 400 }
    );
  }

  const result = await movieRecapTargetResponse(db, id, episode?.id ?? null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ...result.body, failed });
}
