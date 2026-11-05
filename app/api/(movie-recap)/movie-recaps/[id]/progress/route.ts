import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProgress } from "@/lib/api/map";
import { supabaseRoute } from "@/lib/supabase/route";

const PROGRESS_COLUMNS = [
  "render_status",
  "render_stage",
  "render_progress_current",
  "render_progress_total",
  "script_status",
  "script_stage",
  "script_progress_current",
  "script_progress_total",
  "transcript_status",
  "transcript_stage",
  "transcript_progress_current",
  "transcript_progress_total",
  "transcript_progress_partial",
].join(",");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select(PROGRESS_COLUMNS).eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(mapMovieRecapProgress(data as unknown as Record<string, unknown>));
}
