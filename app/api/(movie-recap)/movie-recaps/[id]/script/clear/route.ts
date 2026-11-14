import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapEpisode, mapMovieRecapProject } from "@/lib/api/map";
import { loadMovieRecapTarget } from "@/lib/movie-recap-episode-target";
import { clearNarrationAudio } from "@/lib/movie-recap-script";
import { deleteObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

// Deletes the built Narrative Script so the step starts again from Build.
// Approved exception to "only Resync replaces the script"; see
// history/movie-recap.md 2026-11-14.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const { project, episode } = target;

  if (project.scriptStatus === "running" || project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the run in progress to finish." }, { status: 409 });
  }

  await clearNarrationAudio(project, episode ?? undefined);

  if (episode) {
    const { error } = await db.from("movie_recap_episodes").update({
      render_script: null, script_status: "idle", script_error: null, updated_at: new Date().toISOString(),
    }).eq("id", episode.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (project.renderAnalysisKey) await deleteObject(project.renderAnalysisKey).catch(() => undefined);
    const { error } = await db.from("movie_recap_projects").update({
      render_script: null,
      render_analysis_key: null,
      script_status: "idle",
      script_stage: null,
      script_progress_current: null,
      script_progress_total: null,
      script_error: null,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  if (!episode) return NextResponse.json(mapMovieRecapProject(data));
  const { data: episodeRow } = await db.from("movie_recap_episodes").select("*").eq("id", episode.id).single();
  return NextResponse.json({ ...mapMovieRecapProject(data), episode: episodeRow ? mapMovieRecapEpisode(episodeRow) : null });
}
