import { NextRequest, NextResponse } from "next/server";
import { cancelMovieRecapTranscript } from "@/lib/movie-recap-transcript";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select("id, transcript_status").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const cancelled = cancelMovieRecapTranscript(data.id);
  if (!cancelled && data.transcript_status === "running") {
    // No live AbortController for this id — a process restart wipes the
    // in-memory map without ever reaching the pipeline's own catch block,
    // leaving the row at "running" forever. Nothing is running, so reset it.
    await db
      .from("movie_recap_projects")
      .update({
        transcript_status: "failed",
        transcript_error: "Cancelled.",
        transcript_stage: null,
        transcript_progress_current: null,
        transcript_progress_total: null,
      })
      .eq("id", data.id);
    return NextResponse.json({ cancelled: true });
  }
  return NextResponse.json({ cancelled });
}
