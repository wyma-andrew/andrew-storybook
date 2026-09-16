import { NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { grabMovieRecapThumbnail, storeMovieRecapThumbnail } from "@/lib/movie-recap-thumbnail";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
// One frame over HTTP range requests — seconds, not the render's minutes.
export const maxDuration = 60;

// Re-grab the cover art at the NEXT position in the shuffle. There is no body:
// which frame you get is the row's business, so pressing twice cannot land on
// the same one and the client has nothing to keep in sync.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  // RLS is the authorization boundary here — a project the user does not own
  // simply does not come back.
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  if (project.sourceUploadStatus !== "ready" || !project.sourceUrl) {
    return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
  }

  const attempt = project.thumbnailAttempt + 1;
  let patch;
  try {
    const result = await grabMovieRecapThumbnail(project, attempt);
    patch = await storeMovieRecapThumbnail(project, result, attempt);
  } catch {
    // A frame that will not decode (a black gap, a damaged GOP) is a bad press,
    // not a broken project — the row keeps the thumbnail it already had.
    return NextResponse.json({ error: "Could not read a frame from the source video." }, { status: 502 });
  }

  const { data, error: updateError } = await db
    .from("movie_recap_projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}
