import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapMovieRecapSocialPost } from "@/lib/api/map";
import { FACEBOOK_MIN_SCHEDULE_LEAD_MS } from "@/lib/constants/facebook";
import { facebookConfigured, readFacebookVideoState, scheduleFacebookReel } from "@/lib/facebook";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

// Shared by the project routes (default render, episodeId null) and the
// episode routes. The Page token is one platform-wide secret, so posting is
// admin-only even though the rows are reached through RLS.
export async function scheduleRecapReel(req: Request, projectId: string, episodeId: string | null) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!facebookConfigured()) {
    return NextResponse.json({ error: "Set FB_PAGE_ID and FB_PAGE_TOKEN in .env first." }, { status: 503 });
  }

  const body = await req.json().catch(() => null) as { description?: unknown; publishAt?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const publishAt = new Date(typeof body?.publishAt === "string" ? body.publishAt : NaN);
  if (Number.isNaN(publishAt.getTime())) {
    return NextResponse.json({ error: "Pick a publish date and time." }, { status: 400 });
  }
  // Meta rejects anything closer than ten minutes with a generic OAuthException;
  // checking here gives a message that says what to change.
  if (publishAt.getTime() - Date.now() < FACEBOOK_MIN_SCHEDULE_LEAD_MS) {
    return NextResponse.json({ error: "Facebook needs the publish time at least 10 minutes from now." }, { status: 400 });
  }

  const db = await supabaseRoute();
  const { data, error } = episodeId
    ? await db.from("movie_recap_episodes").select("object_key:output_object_key")
        .eq("id", episodeId).eq("project_id", projectId).single()
    : await db.from("movie_recap_projects").select("object_key:render_output_object_key").eq("id", projectId).single();
  if (error || !data) return NextResponse.json({ error: episodeId ? "Episode not found." : "Project not found." }, { status: 404 });
  if (!data.object_key) return NextResponse.json({ error: "Render the video first." }, { status: 409 });

  // An hour, not the 5-minute browser download default: Meta fetches the file on
  // its own schedule after the upload call returns.
  const fileUrl = await presignDownload(data.object_key as string, `movie-recap-${episodeId ?? projectId}.mp4`, 3600);
  let videoId: string;
  try {
    ({ videoId } = await scheduleFacebookReel({ fileUrl, description, publishAt }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook scheduling failed." }, { status: 502 });
  }

  const { data: post, error: insertError } = await db.from("movie_recap_social_posts").insert({
    project_id: projectId, episode_id: episodeId, external_id: videoId, description, publish_at: publishAt.toISOString(),
  }).select("*").single();
  // The Reel is already scheduled on Facebook at this point, so a failed insert
  // must not read as a failed schedule — retrying would post it twice.
  if (insertError || !post) {
    return NextResponse.json({ error: `Scheduled on Facebook (video ${videoId}), but saving it here failed: ${insertError?.message ?? "unknown error"}. Do not schedule again — manage it in Meta Business Suite.` }, { status: 500 });
  }
  return NextResponse.json(mapMovieRecapSocialPost(post));
}

// Facebook publishes on its own clock, so "scheduled" rows are re-read from the
// Graph API on every list. A lookup that fails leaves the row as it was rather
// than guessing — a token hiccup must not mark a live post cancelled.
export async function listRecapReels(projectId: string, episodeId: string | null) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const db = await supabaseRoute();
  const query = db.from("movie_recap_social_posts").select("*").eq("project_id", projectId);
  const { data, error } = await (episodeId ? query.eq("episode_id", episodeId) : query.is("episode_id", null))
    .order("publish_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  if (facebookConfigured()) {
    await Promise.all(rows.map(async (row, index) => {
      if (row.status !== "scheduled") return;
      const state = await readFacebookVideoState(row.external_id).catch(() => null);
      if (!state) return;
      const patch = state.status === "failed"
        ? { status: "failed", error: state.error }
        : { status: state.status, permalink_url: state.permalinkUrl };
      if (patch.status === row.status && (patch as { permalink_url?: string | null }).permalink_url === row.permalink_url) return;
      const { data: updated } = await db.from("movie_recap_social_posts")
        .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
      if (updated) rows[index] = updated;
    }));
  }
  return NextResponse.json(rows.map(mapMovieRecapSocialPost));
}
