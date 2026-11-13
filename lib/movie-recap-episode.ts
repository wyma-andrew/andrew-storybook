import type { MovieRecapEpisode, MovieRecapNarrationSegment, MovieRecapProject } from "./api/types";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// An episode borrows the project's script_* and render_* columns as its run
// claim and progress, the way the removed range render did, so one run at a
// time per project still holds and the wizard's poller needs no second source.
// The run puts these columns back when it ends. See history/movie-recap.md.
export type RecapColumnSnapshot = Record<string, string | number | boolean | null>;

export function scriptSnapshot(project: MovieRecapProject): RecapColumnSnapshot {
  return {
    script_status: project.scriptStatus,
    script_stage: project.scriptStage,
    script_progress_current: project.scriptProgressCurrent,
    script_progress_total: project.scriptProgressTotal,
    script_error: project.scriptError,
  };
}

export function renderSnapshot(project: MovieRecapProject): RecapColumnSnapshot {
  return {
    render_status: project.renderStatus,
    render_is_mock: project.renderIsMock,
    render_error: project.renderError,
    render_stage: project.renderStage,
    render_progress_current: project.renderProgressCurrent,
    render_progress_total: project.renderProgressTotal,
    render_started_at: project.renderStartedAt,
    render_completed_at: project.renderCompletedAt,
  };
}

// The project as an episode's script and render see it: same source, voice and
// Customize settings, with the episode's own beats.
export function episodeProject(project: MovieRecapProject, episode: MovieRecapEpisode): MovieRecapProject {
  return { ...project, renderScript: episode.renderScript };
}

export async function writeMovieRecapScript(
  db: Db,
  projectId: string,
  episodeId: string | null,
  script: MovieRecapNarrationSegment[]
) {
  const { error } = episodeId
    ? await db.from("movie_recap_episodes")
        .update({ render_script: script, updated_at: new Date().toISOString() }).eq("id", episodeId)
    : await db.from("movie_recap_projects").update({ render_script: script }).eq("id", projectId);
  if (error) throw new Error(error.message);
}
