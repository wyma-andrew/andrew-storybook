import { NextRequest, NextResponse } from "next/server";
import { presignUploadPart } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!Number.isInteger(body?.partNumber) || body.partNumber < 1 || body.partNumber > 10_000) {
    return NextResponse.json({ error: "Invalid part number." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data } = await db.from("translate_projects").select("source_object_key,source_upload_id").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.source_upload_id) return NextResponse.json({ error: "No active upload." }, { status: 409 });
  return NextResponse.json({ uploadUrl: await presignUploadPart(data.source_object_key, data.source_upload_id, body.partNumber) });
}
