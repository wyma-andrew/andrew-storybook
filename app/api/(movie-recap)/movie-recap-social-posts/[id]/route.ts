import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapMovieRecapSocialPost } from "@/lib/api/map";
import { FACEBOOK_MIN_SCHEDULE_LEAD_MS } from "@/lib/constants/facebook";
import { deleteFacebookVideo, facebookConfigured, updateFacebookVideo } from "@/lib/facebook";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

async function loadScheduled(id: string) {
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_social_posts").select("*").eq("id", id).single();
  if (error || !data) return { db, row: null, failure: NextResponse.json({ error: "Post not found." }, { status: 404 }) };
  if (data.status !== "scheduled") {
    return { db, row: null, failure: NextResponse.json({ error: `This post is ${data.status}; only scheduled posts can change.` }, { status: 409 }) };
  }
  return { db, row: data, failure: null };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!facebookConfigured()) return NextResponse.json({ error: "Set FB_PAGE_ID and FB_PAGE_TOKEN in .env first." }, { status: 503 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { description?: unknown; publishAt?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : undefined;
  const publishAt = typeof body?.publishAt === "string" ? new Date(body.publishAt) : undefined;
  if (publishAt && Number.isNaN(publishAt.getTime())) return NextResponse.json({ error: "Pick a publish date and time." }, { status: 400 });
  if (publishAt && publishAt.getTime() - Date.now() < FACEBOOK_MIN_SCHEDULE_LEAD_MS) {
    return NextResponse.json({ error: "Facebook needs the publish time at least 10 minutes from now." }, { status: 400 });
  }

  const { db, row, failure } = await loadScheduled(id);
  if (failure) return failure;
  const timeChanged = publishAt && publishAt.getTime() !== new Date(row.publish_at).getTime();
  try {
    await updateFacebookVideo(row.external_id, { description, publishAt: timeChanged ? publishAt : undefined });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook update failed." }, { status: 502 });
  }
  const { data, error } = await db.from("movie_recap_social_posts").update({
    ...(description !== undefined && { description }),
    ...(timeChanged && { publish_at: publishAt.toISOString() }),
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Saving the change failed." }, { status: 500 });
  return NextResponse.json(mapMovieRecapSocialPost(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  if (!facebookConfigured()) return NextResponse.json({ error: "Set FB_PAGE_ID and FB_PAGE_TOKEN in .env first." }, { status: 503 });
  const { id } = await params;
  const { db, row, failure } = await loadScheduled(id);
  if (failure) return failure;
  try {
    await deleteFacebookVideo(row.external_id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Facebook delete failed." }, { status: 502 });
  }
  const { data, error } = await db.from("movie_recap_social_posts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Saving the cancel failed." }, { status: 500 });
  return NextResponse.json(mapMovieRecapSocialPost(data));
}
