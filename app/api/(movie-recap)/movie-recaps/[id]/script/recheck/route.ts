import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { remeasureMovieRecapScript } from "@/lib/movie-recap-script";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

// Speak and measure every beat again, as they stand. NOT a resync: the scenes,
// the split and the words are left exactly where they are — this only answers
// whether each line still fits its footage (history/movie-recap.md).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (!project.renderScript?.length) {
    return NextResponse.json({ error: "There is no script to check." }, { status: 400 });
  }

  const { data: claimed } = await db
    .from("movie_recap_projects")
    .update({ script_status: "running", script_error: null, script_stage: null })
    .eq("id", id)
    .neq("script_status", "running")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "The script is already being worked on." }, { status: 409 });

  await remeasureMovieRecapScript(db, project);

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}
