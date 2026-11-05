import { NextRequest, NextResponse } from "next/server";
import { mapTranscriptProgress, TRANSCRIPT_PROGRESS_COLUMNS } from "@/lib/transcript-project";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("transcript_projects").select(TRANSCRIPT_PROGRESS_COLUMNS).eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapTranscriptProgress(data as unknown as Record<string, unknown>));
}
