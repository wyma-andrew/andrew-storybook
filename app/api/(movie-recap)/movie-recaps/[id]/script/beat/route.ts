import { NextRequest, NextResponse } from "next/server";
import { episodeProject } from "@/lib/movie-recap-episode";
import { loadMovieRecapTarget, movieRecapTargetResponse } from "@/lib/movie-recap-episode-target";
import { saveMovieRecapBeat } from "@/lib/movie-recap-script";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 120;

// Write ONE edited beat back. `measure` decides whether it is spoken again: an
// edit that plainly cannot move the timing does not need a TTS call, and the
// beat is marked stale instead. The scenes, the split and every other beat are
// untouched either way — that is the point of the script step being editable
// (history/movie-recap.md).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const index = Number(body?.index);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Which beat?" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "A beat cannot be empty." }, { status: 400 });
  const measure = body?.measure !== false;

  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const { episode } = target;
  const project = episode ? episodeProject(target.project, episode) : target.project;
  if (project.scriptStatus === "running" || project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the run in progress to finish." }, { status: 409 });
  }

  try {
    await saveMovieRecapBeat(db, project, index, text, { measure, episodeId: episode?.id ?? null });
  } catch (checkError) {
    return NextResponse.json(
      { error: checkError instanceof Error ? checkError.message : "Could not save that beat." },
      { status: 400 }
    );
  }

  const result = await movieRecapTargetResponse(db, id, episode?.id ?? null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.body);
}
