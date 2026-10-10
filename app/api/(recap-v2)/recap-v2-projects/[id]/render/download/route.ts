import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("recap_v2_projects").select("name,render_output_key").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.render_output_key) return NextResponse.json({ error: "Render the video first." }, { status: 409 });
  return NextResponse.json({ url: await presignDownload(data.render_output_key, `${data.name}-recap.mp4`) });
}
