import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { mapMovieRecapSocialPost } from "@/lib/api/map";
import { facebookConfigured, readFacebookVideoState } from "@/lib/facebook";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

// Facebook publishes on its own clock, so "scheduled" rows are re-read from the
// Graph API on every list. A lookup that fails leaves the row as it was rather
// than guessing — a token hiccup must not mark a live post cancelled.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_social_posts").select("*").eq("project_id", id)
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
