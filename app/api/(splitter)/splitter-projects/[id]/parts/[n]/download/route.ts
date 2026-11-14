import { NextRequest, NextResponse } from "next/server";
import { presignDownload } from "@/lib/r2";
import type { SplitterPart } from "@/lib/splitter";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("splitter_projects").select("name,parts").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const part = ((data.parts ?? []) as SplitterPart[]).find((item) => item.n === Number(n));
  if (!part?.objectKey) return NextResponse.json({ error: "Split the video first." }, { status: 409 });
  const base = String(data.name).replace(/\.[^.]+$/, "");
  return NextResponse.json({ url: await presignDownload(part.objectKey, `${base}_part_${String(part.n).padStart(2, "0")}.mp4`) });
}
