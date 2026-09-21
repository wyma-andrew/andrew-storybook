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
  // A real render needs the measured narration and the source crop prepared by
  // the script run. Audio and full-source footage are rendered independently.
  if (!mock) {
    if (!(project.renderScript?.length && project.renderAnalysisKey)) {
      return NextResponse.json({ error: "Build the script first — there is nothing to render." }, { status: 400 });
    }
  }

  // CLAIM THE RENDER IN ONE STATEMENT. Reading the status and then acting on it
  // is a race, and it was not a theoretical one: two POSTs arriving in the same
  // second both read a non-running row, both passed the check, and two full
  // renders ran at once — same project, same beats, fighting for the same CPU,
  // with whichever finished last overwriting the row. The `neq` makes Postgres
  // the arbiter: exactly one caller can flip a row out of "running", and the
  // loser gets no row back.
  const startedAt = new Date().toISOString();
  const { data: claimed } = await db
    .from("movie_recap_projects")
    .update({ render_status: "running", render_is_mock: mock, render_error: null, render_started_at: startedAt })
    .eq("id", id)
    .neq("render_status", "running")
    .select("id")
    .maybeSingle();
  if (!claimed) {
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
