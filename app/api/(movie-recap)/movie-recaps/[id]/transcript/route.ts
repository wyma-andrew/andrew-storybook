import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { runMovieRecapTranscript } from "@/lib/movie-recap-transcript";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  // Redo only the parked Burmese retelling, from the transcript already stored —
  // no download, no second Whisper bill.
  const storyOnly = body?.storyOnly === true;
  const dialogueOnly = !storyOnly && body?.dialogueOnly === true;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }
  if (storyOnly && !project.transcript?.length) {
    return NextResponse.json({ error: "There is no transcript to retell. Read the source first." }, { status: 400 });
  }

  // Claimed in one statement, not checked and then acted on — see the render
  // route for the race this closes, which put two full runs on one project.
  const { data: claimed } = await db
    .from("movie_recap_projects")
    .update({ transcript_status: "running", transcript_story_only: storyOnly, transcript_dialogue_only: dialogueOnly, transcript_error: null, transcript_stage: null })
    .eq("id", id)
    .neq("transcript_status", "running")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: "The source is already being read." }, { status: 409 });
  }

  // Synchronous, like the render: it writes its own status onto the row, which
  // is what the browser polls while the request stays open.
  await runMovieRecapTranscript(db, project, { storyOnly, dialogueOnly });

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}
