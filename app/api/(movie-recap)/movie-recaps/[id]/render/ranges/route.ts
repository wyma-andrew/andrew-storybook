import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject, mapMovieRecapRangeRender } from "@/lib/api/map";
import { runMovieRecapRender } from "@/lib/movie-recap-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: project, error: projectError } = await db.from("movie_recap_projects").select("id").eq("id", id).single();
  if (projectError || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data, error } = await db.from("movie_recap_range_renders").select("*").eq("project_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapMovieRecapRangeRender));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const startBeat = body?.startBeat;
  const endBeat = body?.endBeat;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error || !row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const project = mapMovieRecapProject(row);
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl || !project.renderScript?.length) {
    return NextResponse.json({ error: "A ready source and built script are required." }, { status: 400 });
  }
  if (!Number.isSafeInteger(startBeat) || !Number.isSafeInteger(endBeat) ||
      startBeat < 1 || endBeat < startBeat || endBeat > project.renderScript.length) {
    return NextResponse.json({ error: "Choose a valid start and end beat." }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const { data: claimed } = await db.from("movie_recap_projects").update({
    render_status: "running", render_is_mock: false, render_error: null,
    render_stage: null, render_progress_current: null, render_progress_total: null,
    render_started_at: startedAt,
  }).eq("id", id).neq("render_status", "running").select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ error: "A render is already in progress." }, { status: 409 });

  const { data: rangeRow, error: insertError } = await db.from("movie_recap_range_renders")
    .insert({ project_id: id, start_beat: startBeat, end_beat: endBeat })
    .select("*").single();
  if (insertError || !rangeRow) {
    await db.from("movie_recap_projects").update({
      render_status: project.renderStatus,
      render_is_mock: project.renderIsMock,
      render_error: project.renderError,
      render_stage: project.renderStage,
      render_progress_current: project.renderProgressCurrent,
      render_progress_total: project.renderProgressTotal,
      render_started_at: project.renderStartedAt,
    }).eq("id", id);
    return NextResponse.json({ error: insertError?.message ?? "Could not start range render." }, { status: 500 });
  }

  const renderLog = await runMovieRecapRender(db, project, { range: { id: rangeRow.id, startBeat, endBeat } });
  const [projectResult, rangeResult] = await Promise.all([
    db.from("movie_recap_projects").select("*").eq("id", id).single(),
    db.from("movie_recap_range_renders").select("*").eq("id", rangeRow.id).single(),
  ]);
  if (projectResult.error || rangeResult.error || !projectResult.data || !rangeResult.data) {
    return NextResponse.json({ error: "Could not load the range render result." }, { status: 500 });
  }
  if (!renderLog) {
    return NextResponse.json({ error: rangeResult.data.error ?? "Range render failed." }, { status: 500 });
  }
  return NextResponse.json({
    project: mapMovieRecapProject(projectResult.data),
    range: mapMovieRecapRangeRender(rangeResult.data),
    renderLog,
  });
}
