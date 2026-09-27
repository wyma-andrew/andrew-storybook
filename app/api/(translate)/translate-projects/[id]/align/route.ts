import { NextRequest, NextResponse } from "next/server";
import { alignTranslateSubtitles } from "@/lib/translate-align";
import { mapTranslateProject, parseSrt, translateCuesKeepAllText, validTranslateCues } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const sourceCues = parseSrt(typeof row.srt_text === "string" ? row.srt_text : "");
  if (row.source_upload_status !== "ready" || !sourceCues.length) {
    return NextResponse.json({ error: "Upload a video and translated SRT first." }, { status: 409 });
  }
  if (row.render_status === "running" && Date.now() - Date.parse(row.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
  }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Speech alignment is not configured." }, { status: 503 });

  try {
    const cues = await alignTranslateSubtitles(mapTranslateProject(row));
    if (!cues) return NextResponse.json({ error: "No SRT phrases matched the transcript or clear speech boundaries near their cue times. The original SRT remains in use." }, { status: 422 });
    const timingLimit = Math.max(Number(row.source_duration_seconds), sourceCues.reduce((latest, cue) => Math.max(latest, cue.end), 0));
    if (!validTranslateCues(cues, timingLimit) || !translateCuesKeepAllText(cues, row.srt_text)) {
      return NextResponse.json({ error: "Aligned subtitle timing is invalid. The original SRT remains in use." }, { status: 422 });
    }
    const saved = await db.from("translate_projects").update({
      subtitle_cues: cues, subtitle_timing_mode: "aligned", render_status: "idle", render_error: null,
      render_output_key: null, render_output_url: null, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("updated_at", row.updated_at).select("*").maybeSingle();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    if (!saved.data) return NextResponse.json({ error: "Project changed. Refresh and retry alignment." }, { status: 409 });
    return NextResponse.json(mapTranslateProject(saved.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech alignment failed.";
    return NextResponse.json({ error: message.slice(-500) }, { status: 500 });
  }
}
