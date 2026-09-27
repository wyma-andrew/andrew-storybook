import { NextRequest, NextResponse } from "next/server";
import { isTranslateRect, mapTranslateProject, parseSrt, translateCuesKeepAllText, validTranslateCues } from "@/lib/translate";
import { renderTranslateProject } from "@/lib/translate-render";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (row.source_upload_status !== "ready" || typeof row.srt_text !== "string" || new TextEncoder().encode(row.srt_text).length > 2_000_000 || !parseSrt(row.srt_text).length) {
    return NextResponse.json({ error: "Upload a video and a translated SRT before rendering." }, { status: 409 });
  }
  if (!Array.isArray(row.blur_regions) || row.blur_regions.length > 8 || !row.blur_regions.every(isTranslateRect)
    || !["original", "aligned", "translated"].includes(row.subtitle_timing_mode)
    || (row.subtitle_timing_mode === "aligned" && row.subtitle_cues === null)
    || (row.subtitle_timing_mode === "translated" && (typeof row.translated_srt_text !== "string"
      || new TextEncoder().encode(row.translated_srt_text).length > 2_000_000 || !parseSrt(row.translated_srt_text).length))
    || (row.subtitle_cues !== null && (!validTranslateCues(row.subtitle_cues, 24 * 60 * 60)
      || !translateCuesKeepAllText(row.subtitle_cues, row.srt_text)))
    || row.source_width > 7680 || row.source_height > 7680 || row.source_width * row.source_height > 7680 * 4320) {
    return NextResponse.json({ error: "Project video or blur settings are invalid." }, { status: 400 });
  }
  if (row.render_status === "running" && Date.now() - Date.parse(row.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "A render is already running." }, { status: 409 });
  }
  const claimed = await db.from("translate_projects").update({ render_status: "running", render_error: null, render_progress: 0, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  if (claimed.error) return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  if (!claimed.data) return NextResponse.json({ error: "A render is already running." }, { status: 409 });
  try {
    let reported = 0;
    let lastWrite = 0;
    const output = await renderTranslateProject(mapTranslateProject(claimed.data), (fraction) => {
      if (fraction - reported < 0.01 || Date.now() - lastWrite < 1500) return;
      reported = fraction;
      lastWrite = Date.now();
      void db.from("translate_projects").update({ render_progress: fraction }).eq("id", id).eq("render_status", "running");
    });
    const saved = await db.from("translate_projects").update({
      render_status: "done", render_error: null, render_progress: null, render_output_key: output.objectKey,
      render_output_url: output.url, updated_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    if (saved.error || !saved.data) throw saved.error ?? new Error("Could not save rendered video.");
    return NextResponse.json(mapTranslateProject(saved.data));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(-1500) : "Video render failed.";
    await db.from("translate_projects").update({ render_status: "failed", render_error: message, render_progress: null, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
