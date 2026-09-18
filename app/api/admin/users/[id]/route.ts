import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { featuresFromProfile } from "@/lib/api/features";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/constants/features";
import { chapterPrefix, deletePrefix, movieRecapProjectPrefix } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/api/types";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const columns: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) {
    const value = (body?.features as Partial<Record<FeatureKey, boolean>> | undefined)?.[key];
    if (typeof value === "boolean") columns[`can_use_${key}`] = value;
  }
  if (typeof body?.isAdmin === "boolean") columns.is_admin = body.isAdmin;
  if (!Object.keys(columns).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const db = supabaseAdmin();

  if (columns.is_admin === false) {
    // Losing admin is not like losing a feature: only an admin can hand it
    // back. Revoking your own, or the last one, is a door that locks behind
    // you — ADMIN_EMAILS would be the only way back in.
    if (id === admin!.id) return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
    const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "There has to be at least one admin." }, { status: 400 });
  }
  const { data: profile, error } = await db
    .from("profiles")
    .update({ ...columns, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: authUser } = await db.auth.admin.getUserById(id);
  const user: AdminUser = {
    id: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    lastSignInAt: authUser?.user?.last_sign_in_at ?? null,
    isAdmin: profile.is_admin === true,
    features: featuresFromProfile(profile),
  };
  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user: admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;

  // An admin who deletes their own account loses the only way back in, and the
  // allowlist is an env var they may not be able to edit from here.
  if (id === admin!.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });

  const db = supabaseAdmin();

  // Storage first, account second. The database rows go with the user through
  // `on delete cascade`, and once they are gone nothing points at the objects
  // any more — so a storage failure here has to leave the account intact and be
  // retryable, exactly as the recap project DELETE does.
  try {
    const { data: recaps } = await db.from("movie_recap_projects").select("id").eq("owner_id", id);
    for (const recap of recaps ?? []) await deletePrefix(movieRecapProjectPrefix(recap.id));

    const { data: stories } = await db.from("stories").select("id").eq("owner_id", id);
    const storyIds = (stories ?? []).map((story) => story.id);
    if (storyIds.length) {
      const { data: chapters } = await db.from("chapters").select("id").in("story_id", storyIds);
      for (const chapter of chapters ?? []) await deletePrefix(chapterPrefix(chapter.id));
    }
  } catch (storageError) {
    return NextResponse.json(
      { error: storageError instanceof Error ? storageError.message : "Could not remove stored files." },
      { status: 502 }
    );
  }

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(null);
}
