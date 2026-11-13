import { NextResponse } from "next/server";
import { episodeProject } from "@/lib/movie-recap-episode";
import { loadMovieRecapTarget } from "@/lib/movie-recap-episode-target";
import { buildMovieRecapSceneTimingPlan } from "@/lib/movie-recap-scene-plan";
import { MOVIE_RECAP_PLAYBACK_SPEED } from "@/lib/constants/movie-recap";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const project = target.episode ? episodeProject(target.project, target.episode) : target.project;
  if (!project.renderScript?.length) {
    return NextResponse.json({ error: "Build the Narrative Script first." }, { status: 400 });
  }

  const plan = buildMovieRecapSceneTimingPlan({
    narration: project.renderScript,
    videoSpeed: MOVIE_RECAP_PLAYBACK_SPEED,
  });
  return NextResponse.json({
    plan,
    measured: project.renderScript.every((beat) => typeof beat.audioS === "number" && !beat.audioStale),
  });
}
