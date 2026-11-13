// Movie Recap's two heavy runs — the SCRIPT (TTS for every beat + narration
// master) and the RENDER (full-source ffmpeg) — can run on GitHub Actions
// instead of inside the Next server. Neither the local machine nor free hosting
// copes with them: free hosts cap request time and CPU well below a 2-hour
// source, and a laptop render ties the machine up.
//
// The route still CLAIMS the row exactly as before (the `neq("running")`
// update), then hands the run to `.github/workflows/recap-job.yml` and returns.
// The workflow runs `scripts/recap-job.ts`, which calls the same
// `runMovieRecapScript` / `runMovieRecapRender` and writes status/progress onto
// the row; the wizard's existing 2-second poller is what the user watches.
// Cancel already works across processes — both pipelines re-read their status
// between steps and stop when it is no longer "running".
//
// Off unless RECAP_JOB_RUNNER=github, so local dev keeps running in-process.

import type { RecapColumnSnapshot } from "@/lib/movie-recap-episode";

// An episode run borrows the project's run columns and puts them back when it
// ends. The worker only ever sees the row AFTER the claim ("running"), so the
// route sends the pre-claim `previous` snapshot.
type EpisodeScope = { episodeId?: undefined; previous?: undefined } | { episodeId: string; previous: RecapColumnSnapshot };

export type RecapJob =
  | ({ kind: "script"; projectId: string; revoice?: boolean } & EpisodeScope)
  | ({ kind: "render"; projectId: string; mock: boolean } & EpisodeScope);

export function remoteRecapJobsEnabled() {
  return process.env.RECAP_JOB_RUNNER === "github";
}

export async function dispatchRecapJob(job: RecapJob) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  const workflow = process.env.GITHUB_DISPATCH_WORKFLOW || "recap-job.yml";
  const ref = process.env.GITHUB_DISPATCH_REF || "main";
  if (!token || !repo) throw new Error("GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set to run recap jobs on GitHub Actions.");

  // workflow_dispatch inputs are strings only.
  const inputs: Record<string, string> = { kind: job.kind, project_id: job.projectId };
  if (job.kind === "render") inputs.mock = String(job.mock);
  // Only when set: GitHub rejects an input the dispatched ref's workflow does
  // not declare, so a plain build must not depend on the revoice input existing.
  if (job.kind === "script" && job.revoice) inputs.revoice = "true";
  if (job.episodeId) {
    inputs.episode_id = job.episodeId;
    inputs.previous = JSON.stringify(job.previous);
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref, inputs }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub Actions dispatch failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
