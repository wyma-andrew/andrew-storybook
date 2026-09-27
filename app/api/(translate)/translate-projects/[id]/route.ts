import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, deletePrefix, translateProjectPrefix } from "@/lib/r2";
import { isTranslateRect, mapTranslateProject, parseSrt, translateCuesKeepAllText, validTranslateCues } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapTranslateProject(data));
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (current.render_status === "running" && Date.now() - Date.parse(current.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid project settings." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let changesRender = false;
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    patch.name = body.name.trim().slice(0, 200);
  }
  if (body.srtText !== undefined || body.srtFileName !== undefined) {
    const text = body.srtText;
    const name = body.srtFileName;
    if (typeof text !== "string" || typeof name !== "string" || !name.trim() || new TextEncoder().encode(text).length > 2_000_000 || !parseSrt(text).length) {
      return NextResponse.json({ error: "Choose a valid SRT file smaller than 2 MB." }, { status: 400 });
    }
    patch.srt_text = text;
    patch.srt_file_name = name.trim().slice(0, 300);
    if (text !== current.srt_text) {
      patch.subtitle_cues = null;
      patch.subtitle_timing_mode = "original";
      changesRender = true;
    }
  }
  if (body.translatedSrtText !== undefined || body.translatedSrtFileName !== undefined) {
    const text = body.translatedSrtText;
    const name = body.translatedSrtFileName;
    if (typeof text !== "string" || typeof name !== "string" || !name.trim() || new TextEncoder().encode(text).length > 2_000_000 || !parseSrt(text).length) {
      return NextResponse.json({ error: "Choose a valid translated SRT file smaller than 2 MB." }, { status: 400 });
    }
    patch.translated_srt_text = text;
    patch.translated_srt_file_name = name.trim().slice(0, 300);
    changesRender ||= text !== current.translated_srt_text;
  }
  if (body.subtitleCues !== undefined) {
    if (body.subtitleCues !== null && (!validTranslateCues(body.subtitleCues, 24 * 60 * 60)
      || !translateCuesKeepAllText(body.subtitleCues, String(patch.srt_text ?? current.srt_text ?? "")))) {
      return NextResponse.json({ error: "Subtitle timing is invalid." }, { status: 400 });
    }
    patch.subtitle_cues = body.subtitleCues;
    changesRender ||= JSON.stringify(body.subtitleCues) !== JSON.stringify(current.subtitle_cues);
  }
  if (body.subtitleTimingMode !== undefined) {
    if (!["original", "aligned", "translated"].includes(body.subtitleTimingMode)) {
      return NextResponse.json({ error: "Subtitle timing mode is invalid." }, { status: 400 });
    }
    patch.subtitle_timing_mode = body.subtitleTimingMode;
  }
  if ((patch.subtitle_cues === null && (patch.subtitle_timing_mode ?? current.subtitle_timing_mode) === "aligned")
    || (patch.srt_text !== undefined && patch.srt_text !== current.srt_text)) {
    patch.subtitle_timing_mode = "original";
  }
  if (patch.subtitle_timing_mode === "translated" && (patch.translated_srt_text ?? current.translated_srt_text) == null) {
    return NextResponse.json({ error: "Import a translated SRT before selecting it." }, { status: 400 });
  }
  if (patch.subtitle_timing_mode === "aligned" && (patch.subtitle_cues ?? current.subtitle_cues) === null) {
    return NextResponse.json({ error: "Sync subtitles before selecting synced timing." }, { status: 400 });
  }
  changesRender ||= patch.subtitle_timing_mode !== undefined && patch.subtitle_timing_mode !== current.subtitle_timing_mode;
  if (body.blurRegions !== undefined) {
    if (!Array.isArray(body.blurRegions) || body.blurRegions.length > 8 || !body.blurRegions.every(isTranslateRect)) {
      return NextResponse.json({ error: "Blur areas are invalid (maximum 8)." }, { status: 400 });
    }
    patch.blur_regions = body.blurRegions;
    changesRender ||= JSON.stringify(body.blurRegions) !== JSON.stringify(current.blur_regions);
  }
  for (const [client, column, min, max] of [
    ["subtitleY", "subtitle_y", 5, 98], ["subtitleSize", "subtitle_size", 1, 10],
  ] as const) {
    if (body[client] !== undefined) {
      const value = body[client];
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return NextResponse.json({ error: `${client} must be ${min}–${max}.` }, { status: 400 });
      patch[column] = value;
      changesRender ||= value !== current[column];
    }
  }
  if (changesRender) {
    patch.render_status = "idle";
    patch.render_error = null;
    patch.render_output_key = null;
    patch.render_output_url = null;
  }
  const { data, error } = await db.from("translate_projects").update(patch).eq("id", id).eq("updated_at", current.updated_at).select("*").maybeSingle();
  if (!error && !data) return NextResponse.json({ error: "Project changed. Refresh and try again." }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not save project." }, { status: 500 });
  return NextResponse.json(mapTranslateProject(data));
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("translate_projects").select("source_object_key,source_upload_id,render_status,updated_at").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (data.render_status === "running" && Date.now() - Date.parse(data.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the render to finish." }, { status: 409 });
  }
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id);
    await deletePrefix(translateProjectPrefix(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove project files." }, { status: 502 });
  }
  const removed = await db.from("translate_projects").delete().eq("id", id);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json(null);
}
