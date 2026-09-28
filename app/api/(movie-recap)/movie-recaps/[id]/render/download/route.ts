import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects")
    .select("render_output_object_key").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.render_output_object_key) return NextResponse.json({ error: "Render the video first." }, { status: 409 });
  const url = await presignDownload(data.render_output_object_key, `movie-recap-${id}.mp4`);
  return NextResponse.json({ url });
}
