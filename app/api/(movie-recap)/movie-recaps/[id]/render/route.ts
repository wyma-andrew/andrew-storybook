import { NextRequest, NextResponse } from "next/server";
import { episodeProject, renderSnapshot } from "@/lib/movie-recap-episode";
import { loadMovieRecapTarget, movieRecapTargetResponse } from "@/lib/movie-recap-episode-target";
import { runMovieRecapRender } from "@/lib/movie-recap-render";
import { dispatchRecapJob, remoteRecapJobsEnabled } from "@/lib/recap-job-dispatch";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const mock = body?.mock === true;
  const db = await supabaseRoute();
  const target = await loadMovieRecapTarget(db, id, body?.episodeId);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 404 });
  const { episode } = target;
  const project = episode ? episodeProject(target.project, episode) : target.project;
  if (episode && mock) return NextResponse.json({ error: "Mock preview renders the default script only." }, { status: 400 });
  if (episode && project.scriptStatus === "running") {
    return NextResponse.json({ error: "Wait for the script run in progress to finish." }, { status: 409 });
  }
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }
  // A real render needs the measured narration. A missing source crop is
  // measured by the render itself (same-video replacement clears it).
  if (!mock) {
    if (!project.renderScript?.length) {
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
  const previous = renderSnapshot(target.project);
  if (episode) {
    await db.from("movie_recap_episodes").update({
      render_status: "running", render_error: null, updated_at: new Date().toISOString(),
    }).eq("id", episode.id);
  }

  let renderLog = null;
  if (remoteRecapJobsEnabled()) {
    // Queued on GitHub Actions; the poller watches the row from here. The shot
    // log stays in the runner's output — see lib/recap-job-dispatch.ts.
    try {
      await dispatchRecapJob(episode
        ? { kind: "render", projectId: id, mock: false, episodeId: episode.id, previous }
        : { kind: "render", projectId: id, mock });
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
      if (episode) {
        await db.from("movie_recap_episodes").update({ render_status: "failed", render_error: message }).eq("id", episode.id);
        await db.from("movie_recap_projects").update(previous).eq("id", id);
      } else {
        await db.from("movie_recap_projects").update({
          render_status: "failed", render_error: message, render_completed_at: new Date().toISOString(),
        }).eq("id", id);
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    // Synchronous, like the other AI passes (analyze/storyboard/sync) — writes
    // its own status/result onto the row rather than throwing.
    renderLog = await runMovieRecapRender(db, project, episode ? { episode, previous } : { mock });
  }

  const result = await movieRecapTargetResponse(db, id, episode?.id ?? null);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });
  // `renderLog` rides along with the project rather than being stored: it is a
  // per-generation record the browser keeps in localStorage, not project data.
  return NextResponse.json({ ...result.body, renderLog });
}
