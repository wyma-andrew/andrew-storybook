import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapEpisode, mapMovieRecapProject } from "@/lib/api/map";
import { episodeProject, scriptSnapshot } from "@/lib/movie-recap-episode";
import { loadMovieRecapTarget } from "@/lib/movie-recap-episode-target";
import { runMovieRecapScript } from "@/lib/movie-recap-script";
import { dispatchRecapJob, remoteRecapJobsEnabled } from "@/lib/recap-job-dispatch";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

// Build and MEASURE the script, stopping before anything is cut. Approving what
// it produces is a separate call, and the render refuses to run without it — see
// history/movie-recap.md.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const revoice = body?.revoice === true;
  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const { episode } = target;
  const project = episode ? episodeProject(target.project, episode) : target.project;

  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }
  if (revoice ? !project.renderScript?.length : !project.transcriptStory?.trim()) {
    return NextResponse.json({ error: revoice ? "There is no script to re-voice yet." : "Add the Burmese story, with its timestamps, first." }, { status: 400 });
  }
  if (episode && project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the render in progress to finish." }, { status: 409 });
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

  const previous = scriptSnapshot(target.project);
  if (episode) {
    await db.from("movie_recap_episodes").update({
      script_status: "running", script_error: null, updated_at: new Date().toISOString(),
    }).eq("id", episode.id);
  }

  if (remoteRecapJobsEnabled()) {
    // The poller watches the row from here; see lib/recap-job-dispatch.ts.
    try {
      await dispatchRecapJob(episode
        ? { kind: "script", projectId: id, revoice, episodeId: episode.id, previous }
        : { kind: "script", projectId: id, revoice });
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
      if (episode) {
        await db.from("movie_recap_episodes").update({ script_status: "failed", script_error: message }).eq("id", episode.id);
        await db.from("movie_recap_projects").update(previous).eq("id", id);
      } else {
        await db.from("movie_recap_projects").update({ script_status: "failed", script_error: message }).eq("id", id);
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    await runMovieRecapScript(db, project, episode ? { revoice, episode, previous } : { revoice });
  }

  const { data, error: refetchError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (refetchError) return NextResponse.json({ error: refetchError.message }, { status: 500 });
  if (!episode) return NextResponse.json(mapMovieRecapProject(data));
  const { data: episodeRow } = await db.from("movie_recap_episodes").select("*").eq("id", episode.id).single();
  return NextResponse.json({ ...mapMovieRecapProject(data), episode: episodeRow ? mapMovieRecapEpisode(episodeRow) : null });
}
