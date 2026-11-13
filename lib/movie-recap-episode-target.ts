import { mapMovieRecapEpisode, mapMovieRecapProject } from "./api/map";
import type { supabaseRoute } from "./supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

export async function loadMovieRecapTarget(db: Db, projectId: string, episodeId: unknown) {
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", projectId).single();
  if (error || !row) return { error: "Project not found." } as const;
  const project = mapMovieRecapProject(row);
  if (episodeId == null || episodeId === "") return { project, episode: null } as const;
  if (typeof episodeId !== "string") return { error: "Episode not found." } as const;
  const { data: episodeRow } = await db.from("movie_recap_episodes").select("*")
    .eq("id", episodeId).eq("project_id", projectId).maybeSingle();
  if (!episodeRow) return { error: "Episode not found." } as const;
  return { project, episode: mapMovieRecapEpisode(episodeRow) } as const;
}

export async function movieRecapTargetResponse(db: Db, projectId: string, episodeId: string | null) {
  const { data, error } = await db.from("movie_recap_projects").select("*").eq("id", projectId).single();
  if (error || !data) return { error: error?.message ?? "Project not found." } as const;
  const project = mapMovieRecapProject(data);
  if (!episodeId) return { body: project } as const;
  const { data: episodeRow, error: episodeError } = await db.from("movie_recap_episodes").select("*").eq("id", episodeId).single();
  if (episodeError || !episodeRow) return { error: episodeError?.message ?? "Episode not found." } as const;
  return { body: { ...project, episode: mapMovieRecapEpisode(episodeRow) } } as const;
}
