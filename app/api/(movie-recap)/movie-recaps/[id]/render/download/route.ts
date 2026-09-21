import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = req.nextUrl.searchParams.get("asset");
  if (asset !== "audio" && asset !== "footage") {
    return NextResponse.json({ error: "asset must be audio or footage." }, { status: 400 });
  }

  const db = await supabaseRoute();
  const column = asset === "audio" ? "render_audio_object_key" : "render_footage_object_key";
  const { data, error } = await db.from("movie_recap_projects").select(`name, ${column}`).eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const objectKey = data[column as keyof typeof data];
  if (typeof objectKey !== "string" || !objectKey) {
    return NextResponse.json({ error: `The rendered ${asset} asset is not available.` }, { status: 404 });
  }

  const extension = asset === "audio" ? "wav" : "mp4";
  const safeName = String(data.name || "movie-recap").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "movie-recap";
  return NextResponse.redirect(await presignDownload(objectKey, `${safeName}-${asset}.${extension}`));
}
