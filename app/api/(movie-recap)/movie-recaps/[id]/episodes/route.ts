import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapEpisode } from "@/lib/api/map";
import { parseTimestampedBlocks } from "@/lib/movie-recap-manual-script";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_episodes").select("*").eq("project_id", id)
    .order("start_beat").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapMovieRecapEpisode));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const startBeat = body?.startBeat;
  const endBeat = body?.endBeat;
  if (!name) return NextResponse.json({ error: "Name the episode." }, { status: 400 });

  const db = await supabaseRoute();
  const { data: project, error } = await db.from("movie_recap_projects")
    .select("transcript_story, source_duration_seconds").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const beatCount = parseTimestampedBlocks(project.transcript_story ?? "", Number(project.source_duration_seconds)).length;
  if (!Number.isSafeInteger(startBeat) || !Number.isSafeInteger(endBeat) ||
      startBeat < 1 || endBeat < startBeat || endBeat > beatCount) {
    return NextResponse.json({ error: "Choose a valid start and end beat." }, { status: 400 });
  }

  const { data, error: insertError } = await db.from("movie_recap_episodes")
    .insert({ project_id: id, name, start_beat: startBeat, end_beat: endBeat })
    .select("*").single();
  if (insertError || !data) return NextResponse.json({ error: insertError?.message ?? "Could not create the episode." }, { status: 500 });
  return NextResponse.json(mapMovieRecapEpisode(data));
}
