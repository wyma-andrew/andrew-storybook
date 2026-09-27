import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; rangeId: string }> }) {
  const { id, rangeId } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_range_renders").select("output_object_key, start_beat, end_beat, status")
    .eq("id", rangeId).eq("project_id", id).single();
  if (error || !data || data.status !== "done" || !data.output_object_key) {
    return NextResponse.json({ error: "Range video not found." }, { status: 404 });
  }
  const url = await presignDownload(data.output_object_key, `beats-${data.start_beat}-${data.end_beat}.mp4`);
  return NextResponse.json({ url });
}
