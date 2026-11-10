// Entry point for `.github/workflows/recap-job.yml` (see lib/recap-job-dispatch.ts).
// The route has already claimed the row; this runs the same pipeline the route
// would have run in-process, against the service-role client.
//
//   npx tsx scripts/recap-job.ts script <projectId>
//   npx tsx scripts/recap-job.ts render <projectId> [--mock]
//   npx tsx scripts/recap-job.ts range  <projectId> <rangeId> <startBeat> <endBeat> <previousJson>
//   npx tsx scripts/recap-job.ts fail   <kind> <projectId> [rangeId] [previousJson] <message>
//
// `fail` is the workflow's `if: failure() || cancelled()` step: a runner that is
// killed (timeout, cancel from the Actions tab) never reaches the pipeline's own
// catch, and the row would sit at "running" forever.
import { mapMovieRecapProject } from "@/lib/api/map";
import { runMovieRecapRender } from "@/lib/movie-recap-render";
import { runMovieRecapScript } from "@/lib/movie-recap-script";
import type { RecapRenderSnapshot } from "@/lib/recap-job-dispatch";
import { supabaseAdmin } from "@/lib/supabase/server";

const db = supabaseAdmin();

async function loadProject(id: string) {
  const { data, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`Project ${id} not found: ${error?.message ?? "no row"}`);
  return mapMovieRecapProject(data);
}

function snapshotColumns(previous: RecapRenderSnapshot) {
  return {
    render_status: previous.renderStatus,
    render_is_mock: previous.renderIsMock,
    render_error: previous.renderError,
    render_stage: previous.renderStage,
    render_progress_current: previous.renderProgressCurrent,
    render_progress_total: previous.renderProgressTotal,
    render_started_at: previous.renderStartedAt,
    render_completed_at: previous.renderCompletedAt,
  };
}

async function markFailed(kind: string, projectId: string, rangeId: string | undefined, previousJson: string | undefined, message: string) {
  const now = new Date().toISOString();
  if (kind === "script") {
    await db.from("movie_recap_projects")
      .update({ script_status: "failed", script_error: message })
      .eq("id", projectId).eq("script_status", "running");
    return;
  }
  if (kind === "range" && rangeId) {
    await db.from("movie_recap_range_renders")
      .update({ status: "failed", error: message, updated_at: now })
      .eq("id", rangeId).eq("status", "running");
    if (previousJson) {
      await db.from("movie_recap_projects")
        .update(snapshotColumns(JSON.parse(previousJson)))
        .eq("id", projectId).eq("render_status", "running");
      return;
    }
  }
  await db.from("movie_recap_projects")
    .update({
      render_status: "failed", render_error: message,
      render_progress_current: null, render_progress_total: null, render_completed_at: now,
    })
    .eq("id", projectId).eq("render_status", "running");
}

async function main() {
  const [kind, ...args] = process.argv.slice(2);

  if (kind === "script") {
    const project = await loadProject(args[0]);
    await runMovieRecapScript(db, project, { revoice: args.includes("--revoice") });
    const after = await loadProject(project.id);
    console.log(`[recap-job] script ${project.id} -> ${after.scriptStatus}${after.scriptError ? `: ${after.scriptError}` : ""}`);
    return after.scriptStatus === "ready";
  }

  if (kind === "render") {
    const project = await loadProject(args[0]);
    const renderLog = await runMovieRecapRender(db, project, { mock: args.includes("--mock") });
    const after = await loadProject(project.id);
    console.log(`[recap-job] render ${project.id} -> ${after.renderStatus}${after.renderError ? `: ${after.renderError}` : ""}`);
    return Boolean(renderLog);
  }

  if (kind === "range") {
    const [projectId, rangeId, start, end, previousJson] = args;
    const previous = JSON.parse(previousJson) as RecapRenderSnapshot;
    // The pipeline restores these columns when the range finishes, so it must
    // see the pre-claim values, not the "running" row the claim left behind.
    const project = { ...(await loadProject(projectId)), ...previous };
    const renderLog = await runMovieRecapRender(db, project, {
      range: { id: rangeId, startBeat: Number(start), endBeat: Number(end) },
    });
    console.log(`[recap-job] range ${rangeId} (beats ${start}-${end}) -> ${renderLog ? "done" : "failed"}`);
    return Boolean(renderLog);
  }

  if (kind === "fail") {
    const [failedKind, projectId, ...rest] = args;
    const message = rest.pop() ?? "The GitHub Actions run stopped.";
    const [rangeId, previousJson] = rest;
    await markFailed(failedKind, projectId, rangeId || undefined, previousJson || undefined, message);
    return true;
  }

  throw new Error(`Unknown job kind: ${kind}`);
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
