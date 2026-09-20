import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { saveMovieRecapBeats } from "@/lib/movie-recap-script";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 60;

// Write several edited beats back in one go — the paste half of the round trip
// that starts with the copyable prompt. Nothing is spoken here; the beats are
// marked stale and a re-check afterwards measures only what changed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const edits = Array.isArray(body?.edits) ? body.edits : null;
  if (!edits?.length) return NextResponse.json({ error: "Nothing to apply." }, { status: 400 });

  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (project.scriptStatus === "running" || project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the run in progress to finish." }, { status: 409 });
  }

  try {
    const { changed } = await saveMovieRecapBeats(db, project, edits);
    const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
    if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
    return NextResponse.json({ ...mapMovieRecapProject(data), changed });
  } catch (saveError) {
    return NextResponse.json(
      { error: saveError instanceof Error ? saveError.message : "Could not apply those beats." },
      { status: 400 }
    );
  }
}
