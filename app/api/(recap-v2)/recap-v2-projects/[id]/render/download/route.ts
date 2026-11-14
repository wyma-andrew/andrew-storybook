import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

// `?file=srt` downloads the captions for upload, as the tool's SRT_for_upload.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const srt = req.nextUrl.searchParams.get("file") === "srt";
  const db = await supabaseRoute();
  const { data } = await db.from("recap_v2_projects").select("name,render_output_key,render_srt_key").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const key = srt ? data.render_srt_key : data.render_output_key;
  if (!key) return NextResponse.json({ error: "Render the video first." }, { status: 409 });
  const base = String(data.name).replace(/\.[^.]+$/, "");
  return NextResponse.json({ url: await presignDownload(key, srt ? `${base}.srt` : `${base}_Myanmar.mp4`) });
}
