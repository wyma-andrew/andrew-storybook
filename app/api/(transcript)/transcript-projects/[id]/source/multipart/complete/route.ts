import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload, publicUrlFor } from "@/lib/r2";
import { mapTranscriptProject } from "@/lib/transcript-project";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parts = body?.parts;
  if (!Array.isArray(parts) || !parts.length || parts.some((part) => !Number.isInteger(part.partNumber) || typeof part.etag !== "string")) {
    return NextResponse.json({ error: "Completed upload parts are invalid." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data } = await db.from("transcript_projects").select("*").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.source_upload_id) return NextResponse.json({ error: "No active upload." }, { status: 409 });
  try {
    await completeMultipartUpload(data.source_object_key, data.source_upload_id, parts);
    const updated = await db.from("transcript_projects").update({
      source_url: publicUrlFor(data.source_object_key),
      source_upload_id: null,
      source_upload_status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (updated.error || !updated.data) throw updated.error ?? new Error("Could not finish upload.");
    return NextResponse.json(mapTranscriptProject(updated.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not finish upload." }, { status: 502 });
  }
}
