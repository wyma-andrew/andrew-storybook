// Entry point for `.github/workflows/recap-job.yml` (see lib/recap-job-dispatch.ts).
// The route has already claimed the row; this runs the same pipeline the route
// would have run in-process, against the service-role client.
//
//   npx tsx scripts/recap-job.ts script <projectId> [--revoice] [--episode <id> <previousJson>]
//   npx tsx scripts/recap-job.ts render <projectId> [--mock] [--episode <id> <previousJson>]
//   npx tsx scripts/recap-job.ts fail   <kind> <projectId> [episodeId] [previousJson] <message>
//
// `fail` is the workflow's `if: failure() || cancelled()` step: a runner that is
// killed (timeout, cancel from the Actions tab) never reaches the pipeline's own
// catch, and the row would sit at "running" forever.
import { mapMovieRecapEpisode, mapMovieRecapProject } from "@/lib/api/map";
import { episodeProject, type RecapColumnSnapshot } from "@/lib/movie-recap-episode";
import { runMovieRecapRender } from "@/lib/movie-recap-render";
import { runMovieRecapScript } from "@/lib/movie-recap-script";
import { supabaseAdmin } from "@/lib/supabase/server";

const db = supabaseAdmin();

async function loadProject(id: string) {
  const { data, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`Project ${id} not found: ${error?.message ?? "no row"}`);
  return mapMovieRecapProject(data);
}

async function loadEpisode(id: string) {
  const { data, error } = await db.from("movie_recap_episodes").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`Episode ${id} not found: ${error?.message ?? "no row"}`);
  return mapMovieRecapEpisode(data);
}

function episodeArgs(args: string[]) {
  const at = args.indexOf("--episode");
  if (at < 0) return null;
  return { episodeId: args[at + 1], previous: JSON.parse(args[at + 2]) as RecapColumnSnapshot };
}

async function markFailed(kind: string, projectId: string, episodeId: string | undefined, previousJson: string | undefined, message: string) {
  const now = new Date().toISOString();
  const statusColumn = kind === "script" ? "script_status" : "render_status";
  if (episodeId) {
    await db.from("movie_recap_episodes")
      .update(kind === "script"
        ? { script_status: "failed", script_error: message, updated_at: now }
        : { render_status: "failed", render_error: message, updated_at: now })
      .eq("id", episodeId).eq(statusColumn, "running");
    if (previousJson) {
      await db.from("movie_recap_projects")
        .update(JSON.parse(previousJson) as RecapColumnSnapshot)
        .eq("id", projectId).eq(statusColumn, "running");
    }
    return;
  }
  if (kind === "script") {
    await db.from("movie_recap_projects")
      .update({ script_status: "failed", script_error: message })
      .eq("id", projectId).eq("script_status", "running");
    return;
  }
  await db.from("movie_recap_projects")
    .update({
      render_status: "failed", render_error: message,
      render_progress_current: null, render_progress_total: null, render_completed_at: now,
    })
    .eq("id", projectId).eq("render_status", "running");
}

async function loadTarget(projectId: string, args: string[]) {
  const scope = episodeArgs(args);
  const project = await loadProject(projectId);
  if (!scope) return { project, episode: undefined, previous: undefined };
  const episode = await loadEpisode(scope.episodeId);
  return { project: episodeProject(project, episode), episode, previous: scope.previous };
}

async function main() {
  const [kind, ...args] = process.argv.slice(2);

  if (kind === "script") {
    const { project, episode, previous } = await loadTarget(args[0], args);
    const narration = await runMovieRecapScript(db, project, { revoice: args.includes("--revoice"), episode, previous });
    console.log(`[recap-job] script ${project.id}${episode ? ` episode ${episode.id}` : ""} -> ${narration ? "ready" : "failed"}`);
    return Boolean(narration);
  }

  if (kind === "render") {
    const { project, episode, previous } = await loadTarget(args[0], args);
    const renderLog = await runMovieRecapRender(db, project, { mock: args.includes("--mock"), episode, previous });
    console.log(`[recap-job] render ${project.id}${episode ? ` episode ${episode.id}` : ""} -> ${renderLog ? "done" : "failed"}`);
    return Boolean(renderLog);
  }

  if (kind === "fail") {
    const [failedKind, projectId, ...rest] = args;
    const message = rest.pop() ?? "The GitHub Actions run stopped.";
    const [episodeId, previousJson] = rest;
    await markFailed(failedKind, projectId, episodeId || undefined, previousJson || undefined, message);
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
