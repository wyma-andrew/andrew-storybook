import { NextRequest, NextResponse } from "next/server";
import { cancelMovieRecapRender } from "@/lib/movie-recap-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select("id, render_status").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const cancelled = cancelMovieRecapRender(data.id);
  if (!cancelled && data.render_status === "running") {
    // No live AbortController for this id — a dev-server restart (or any
    // process restart) wipes the in-memory map without ever reaching the
    // pipeline's own catch block, orphaning the row at "running" forever.
    // Nothing is actually running, so it's safe to just reset it here.
    await db
      .from("movie_recap_projects")
      .update({
        render_status: "failed",
        render_error: "Cancelled.",
        render_stage: null,
        render_progress_current: null,
        render_progress_total: null,
        render_completed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    return NextResponse.json({ cancelled: true });
  }
  return NextResponse.json({ cancelled });
}
