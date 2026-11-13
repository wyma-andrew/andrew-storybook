import { NextRequest, NextResponse } from "next/server";
import { cancelMovieRecapRender } from "@/lib/movie-recap-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select("id, render_status, render_output_url").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const cancelled = cancelMovieRecapRender(data.id);
  if (!cancelled && data.render_status === "running") {
    const { data: episode } = await db.from("movie_recap_episodes").select("id")
      .eq("project_id", id).eq("render_status", "running").maybeSingle();
    if (episode) {
      await db.from("movie_recap_episodes").update({
        render_status: "failed", render_error: "Cancelled.", updated_at: new Date().toISOString(),
      }).eq("id", episode.id);
      await db.from("movie_recap_projects").update({
        render_status: data.render_output_url ? "done" : "idle",
        render_error: null,
        render_stage: null,
        render_progress_current: null,
        render_progress_total: null,
      }).eq("id", id);
      return NextResponse.json({ cancelled: true });
    }
    // No live AbortController for this id — a process restart wipes the map
    // without ever reaching the pipeline's own catch block, orphaning the row at
    // "running" forever. Resetting it here is what unsticks that.
    //
    // This used to assume nothing could still be running, and that was wrong: a
    // hot reload gave this route a fresh empty map while the old module's
    // pipeline carried on, so the reset changed nothing and the render went on
    // to overwrite the row with its own result. Two things fixed that — the map
    // now lives on `globalThis` so a reload keeps it, and the pipeline re-reads
    // this status between beats and stops itself when it is no longer "running".
    // So the write below is an instruction to any surviving run, not just a
    // tidy-up. See history/movie-recap.md.
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
