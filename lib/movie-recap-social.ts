import { after, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapMovieRecapSocialPost } from "@/lib/api/map";
import { FACEBOOK_MIN_SCHEDULE_LEAD_MS } from "@/lib/constants/facebook";
import { deleteFacebookVideo, facebookConfigured, finishFacebookReel, readFacebookVideoState, startFacebookReel } from "@/lib/facebook";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

// Past this an "uploading" row is one whose background run was killed (the
// route's maxDuration is 300s); it is marked failed so it can be retried.
const UPLOAD_STALE_MS = 10 * 60_000;

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

  // Written before the upload so a run cut off part-way still leaves a record,
  // and a second click sees it instead of posting twice.
  const { data: post, error: insertError } = await db.from("movie_recap_social_posts").insert({
    project_id: projectId, episode_id: episodeId, status: "uploading", description, publish_at: publishAt.toISOString(),
  }).select("*").single();
  if (insertError || !post) return NextResponse.json({ error: insertError?.message ?? "Could not start the upload." }, { status: 500 });

  const objectKey = data.object_key as string;
  after(() => uploadRecapReel(db, post.id as string, { objectKey, name: episodeId ?? projectId, description, publishAt }));
  return NextResponse.json(mapMovieRecapSocialPost(post));
}

async function uploadRecapReel(db: Db, postId: string, { objectKey, name, description, publishAt }: {
  objectKey: string; name: string; description: string; publishAt: Date;
}) {
  let videoId: string | null = null;
  try {
    videoId = await startFacebookReel();
    await db.from("movie_recap_social_posts").update({ external_id: videoId, updated_at: new Date().toISOString() }).eq("id", postId);
    // An hour, not the 5-minute browser download default: Meta fetches the file
    // on its own schedule after the upload call returns.
    const fileUrl = await presignDownload(objectKey, `movie-recap-${name}.mp4`, 3600);
    await finishFacebookReel({ videoId, fileUrl, description, publishAt });
    await db.from("movie_recap_social_posts").update({ status: "scheduled", error: null, updated_at: new Date().toISOString() }).eq("id", postId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Facebook scheduling failed.";
    console.error(`[FacebookReel] post=${postId} ${message}`);
    if (videoId) await deleteFacebookVideo(videoId).catch(() => undefined);
    await db.from("movie_recap_social_posts").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", postId);
  }
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
  await Promise.all(rows.map(async (row, index) => {
    if (row.status !== "uploading" || Date.now() - new Date(row.created_at).getTime() < UPLOAD_STALE_MS) return;
    if (row.external_id && facebookConfigured()) await deleteFacebookVideo(row.external_id).catch(() => undefined);
    const { data: updated } = await db.from("movie_recap_social_posts").update({
      status: "failed", error: "The upload did not finish in time. Schedule it again.", updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "uploading").select("*").single();
    if (updated) rows[index] = updated;
  }));
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
