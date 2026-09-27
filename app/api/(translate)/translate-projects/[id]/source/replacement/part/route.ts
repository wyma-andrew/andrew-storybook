import { NextRequest, NextResponse } from "next/server";
import { presignUploadPart } from "@/lib/r2";
import { type TranslateVideoReplacement } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!Number.isInteger(body?.partNumber) || body.partNumber < 1 || body.partNumber > 10_000) {
    return NextResponse.json({ error: "Invalid part number." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data } = await db.from("translate_projects").select("source_replacement").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const replacement = data.source_replacement as TranslateVideoReplacement | null;
  if (!replacement) return NextResponse.json({ error: "No video replacement is in progress." }, { status: 409 });
  return NextResponse.json({ uploadUrl: await presignUploadPart(replacement.objectKey, replacement.uploadId, body.partNumber) });
}
