import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { cancelMovieRecapScript } from "@/lib/movie-recap-script";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  // The row is written FIRST and the controller told second. A cancel that
  // cannot reach this process's controller — an older module instance after a
  // hot reload, or a restart — still has to stop the run, and the run checks the
  // row between beats for exactly that. Same fix as the render's cancel.
  const { data, error } = await db
    .from("movie_recap_projects")
    .update({
      script_status: "failed",
      script_error: "Cancelled.",
      script_progress_current: null,
      script_progress_total: null,
    })
    .eq("id", id)
    .eq("script_status", "running")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  cancelMovieRecapScript(id);
  if (!data) {
    const { data: row, error: readError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });
    return NextResponse.json(mapMovieRecapProject(row));
  }
  return NextResponse.json(mapMovieRecapProject(data));
}
