import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, createMultipartUpload, listMultipartParts } from "@/lib/r2";
import { mapTranscriptProject } from "@/lib/transcript-project";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("transcript_projects").select("source_object_key,source_upload_id").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!data.source_upload_id) return NextResponse.json({ parts: [] });
  try {
    return NextResponse.json({ parts: await listMultipartParts(data.source_object_key, data.source_upload_id) });
  } catch {
    return NextResponse.json({ error: "Upload expired. Restart the upload." }, { status: 409 });
  }
}

export async function POST(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("transcript_projects").select("*").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id).catch(() => undefined);
    const uploadId = await createMultipartUpload(data.source_object_key, data.source_content_type);
    const updated = await db.from("transcript_projects").update({ source_upload_id: uploadId, source_upload_status: "uploading", updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (updated.error || !updated.data) throw updated.error ?? new Error("Could not restart upload.");
    return NextResponse.json(mapTranscriptProject(updated.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not restart upload." }, { status: 502 });
  }
}
