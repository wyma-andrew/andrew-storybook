import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { runMovieRecapRender } from "@/lib/movie-recap-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const mock = body?.mock === true;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }
  if (project.renderStatus === "running") {
    return NextResponse.json({ error: "A render is already in progress." }, { status: 409 });
  }

  // Synchronous, like the other AI passes (analyze/storyboard/sync) — writes
  // its own status/result onto the row rather than throwing.
  const renderLog = await runMovieRecapRender(db, project, { mock });

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  // `renderLog` rides along with the project rather than being stored: it is a
  // per-generation record the browser keeps in localStorage, not project data.
  return NextResponse.json({ ...mapMovieRecapProject(data), renderLog });
}
