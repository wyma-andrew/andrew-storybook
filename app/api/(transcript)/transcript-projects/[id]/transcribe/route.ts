import { NextRequest, NextResponse } from "next/server";
import { mapTranscriptProject, transcriptJobRunning } from "@/lib/transcript-project";
import { transcribeSourceVideo } from "@/lib/transcript-worker";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row } = await db.from("transcript_projects").select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (row.source_upload_status !== "ready") return NextResponse.json({ error: "Upload the video first." }, { status: 409 });
  if (transcriptJobRunning(row)) return NextResponse.json({ error: "A transcript is already running." }, { status: 409 });
  const claimed = await db.from("transcript_projects")
    .update({ job_status: "running", job_stage: null, job_error: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  if (claimed.error) return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  if (!claimed.data) return NextResponse.json({ error: "A transcript is already running." }, { status: 409 });
  try {
    const text = await transcribeSourceVideo(row.source_object_key, (stage) => {
      void db.from("transcript_projects").update({ job_stage: stage, updated_at: new Date().toISOString() }).eq("id", id).eq("job_status", "running");
    });
    const saved = await db.from("transcript_projects")
      .update({ transcript_text: text, job_status: "done", job_stage: null, job_error: null, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (saved.error || !saved.data) throw saved.error ?? new Error("Could not save the transcript.");
    return NextResponse.json(mapTranscriptProject(saved.data));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(-1500) : "Transcription failed.";
    await db.from("transcript_projects").update({ job_status: "failed", job_stage: null, job_error: message, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
