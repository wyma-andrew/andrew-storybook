import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { runMovieRecapScript } from "@/lib/movie-recap-script";
import { dispatchRecapJob, remoteRecapJobsEnabled } from "@/lib/recap-job-dispatch";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

// Build and MEASURE the script, stopping before anything is cut. Approving what
// it produces is a separate call, and the render refuses to run without it — see
// history/movie-recap.md.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }
  if (!project.transcriptStory?.trim()) {
    return NextResponse.json({ error: "Add the Burmese story, with its timestamps, first." }, { status: 400 });
  }

  // Claimed in one statement for the same reason the render is: read-then-act is
  // a race, and two script runs on one project would fight over the same row.
  const { data: claimed } = await db
    .from("movie_recap_projects")
    .update({ script_status: "running", script_error: null, script_stage: null })
    .eq("id", id)
    .neq("script_status", "running")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "The script is already being built." }, { status: 409 });

  if (remoteRecapJobsEnabled()) {
    // The poller watches the row from here; see lib/recap-job-dispatch.ts.
    try {
      await dispatchRecapJob({ kind: "script", projectId: id });
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
      await db.from("movie_recap_projects").update({ script_status: "failed", script_error: message }).eq("id", id);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    await runMovieRecapScript(db, project);
  }

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}
