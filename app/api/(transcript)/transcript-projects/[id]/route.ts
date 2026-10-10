import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, deletePrefix, transcriptProjectPrefix } from "@/lib/r2";
import { mapTranscriptProject, transcriptJobRunning } from "@/lib/transcript-project";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("transcript_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapTranscriptProject(data));
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("transcript_projects").select("source_object_key,source_upload_id,job_status,updated_at").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (transcriptJobRunning(data)) return NextResponse.json({ error: "Wait for the transcript to finish." }, { status: 409 });
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id);
    await deletePrefix(transcriptProjectPrefix(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove project files." }, { status: 502 });
  }
  const removed = await db.from("transcript_projects").delete().eq("id", id);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json(null);
}
