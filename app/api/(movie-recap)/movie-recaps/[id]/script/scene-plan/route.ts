import { NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { buildMovieRecapSceneTimingPlan } from "@/lib/movie-recap-scene-plan";
import { MOVIE_RECAP_PLAYBACK_SPEED } from "@/lib/constants/movie-recap";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
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
