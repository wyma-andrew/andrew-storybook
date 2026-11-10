import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapMovieRecapSocialPost } from "@/lib/api/map";
import { FACEBOOK_MIN_SCHEDULE_LEAD_MS } from "@/lib/constants/facebook";
import { facebookConfigured, scheduleFacebookReel } from "@/lib/facebook";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

// The Page token is one platform-wide secret, so posting is admin-only even
// though the project itself is reached through RLS like every other recap route.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!facebookConfigured()) {
    return NextResponse.json({ error: "Set FB_PAGE_ID and FB_PAGE_TOKEN in .env first." }, { status: 503 });
  }

  const { id } = await params;
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
  const { data, error } = await db.from("movie_recap_projects")
    .select("render_output_object_key").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.render_output_object_key) return NextResponse.json({ error: "Render the video first." }, { status: 409 });

  // An hour, not the 5-minute browser download default: Meta fetches the file on
  // its own schedule after the upload call returns.
  const fileUrl = await presignDownload(data.render_output_object_key, `movie-recap-${id}.mp4`, 3600);
  let videoId: string;
  try {
    ({ videoId } = await scheduleFacebookReel({ fileUrl, description, publishAt }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook scheduling failed." }, { status: 502 });
  }

  const { data: post, error: insertError } = await db.from("movie_recap_social_posts").insert({
    project_id: id, external_id: videoId, description, publish_at: publishAt.toISOString(),
  }).select("*").single();
  // The Reel is already scheduled on Facebook at this point, so a failed insert
  // must not read as a failed schedule — retrying would post it twice.
  if (insertError || !post) {
    return NextResponse.json({ error: `Scheduled on Facebook (video ${videoId}), but saving it here failed: ${insertError?.message ?? "unknown error"}. Do not schedule again — manage it in Meta Business Suite.` }, { status: 500 });
  }
  return NextResponse.json(mapMovieRecapSocialPost(post));
}
