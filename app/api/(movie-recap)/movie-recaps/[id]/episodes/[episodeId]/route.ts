import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapEpisode } from "@/lib/api/map";
import { deleteObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

type Params = { params: Promise<{ id: string; episodeId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, episodeId } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name the episode." }, { status: 400 });
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_episodes")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", episodeId).eq("project_id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  return NextResponse.json(mapMovieRecapEpisode(data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, episodeId } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_episodes").select("*")
    .eq("id", episodeId).eq("project_id", id).single();
  if (error || !data) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  if (data.script_status === "running" || data.render_status === "running") {
    return NextResponse.json({ error: "Cancel this episode's run before deleting it." }, { status: 409 });
  }
  // Deleting the episode deletes its post rows; a Reel still scheduled on
  // Facebook would then be unmanageable from here.
  const { count } = await db.from("movie_recap_social_posts").select("id", { count: "exact", head: true })
    .eq("episode_id", episodeId).eq("status", "scheduled");
  if (count) return NextResponse.json({ error: "Cancel this episode's scheduled Facebook Reel before deleting it." }, { status: 409 });
  if (data.output_object_key) {
    try {
      await deleteObject(data.output_object_key);
    } catch {
      return NextResponse.json({ error: "Could not delete the stored video." }, { status: 502 });
    }
  }
  const { error: deleteError } = await db.from("movie_recap_episodes").delete().eq("id", episodeId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json(null);
}
