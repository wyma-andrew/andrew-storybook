import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, deletePrefix, recapV2ProjectPrefix } from "@/lib/r2";
import { mapRecapV2Project, recapV2JobRunning, type RecapV2Unit } from "@/lib/recap-v2";
import { isTranslateRect } from "@/lib/translate";
import { getVoice } from "@/lib/tts/voices";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("recap_v2_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapRecapV2Project(data));
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current } = await db.from("recap_v2_projects").select("*").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (recapV2JobRunning(current)) return NextResponse.json({ error: "Wait for the current step to finish." }, { status: 409 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid project settings." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    patch.name = body.name.trim().slice(0, 200);
  }
  if (body.voiceId !== undefined) {
    if (!getVoice(body.voiceId, "movie-recap")) return NextResponse.json({ error: "Unknown voice." }, { status: 400 });
    patch.voice_id = body.voiceId;
  }
  if (body.aspectRatio !== undefined) {
    if (!["16:9", "9:16", "1:1"].includes(body.aspectRatio)) return NextResponse.json({ error: "Aspect ratio is invalid." }, { status: 400 });
    patch.aspect_ratio = body.aspectRatio;
  }
  if (body.fitMode !== undefined) {
    if (!["contain", "cover"].includes(body.fitMode)) return NextResponse.json({ error: "Fit mode is invalid." }, { status: 400 });
    patch.fit_mode = body.fitMode;
  }
  for (const [client, column] of [["mirror", "mirror"], ["subtitlesEnabled", "subtitles_enabled"], ["shortPauses", "short_pauses"]] as const) {
    if (body[client] === undefined) continue;
    if (typeof body[client] !== "boolean") return NextResponse.json({ error: `${client} must be true or false.` }, { status: 400 });
    patch[column] = body[client];
  }
  for (const [client, column, min, max] of [
    ["zoom", "zoom", 1, 1.5], ["subtitleY", "subtitle_y", 5, 98], ["subtitleSize", "subtitle_size", 1, 10],
  ] as const) {
    if (body[client] === undefined) continue;
    const value = body[client];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return NextResponse.json({ error: `${client} must be ${min}–${max}.` }, { status: 400 });
    patch[column] = value;
  }
  if (body.blurRegions !== undefined) {
    if (!Array.isArray(body.blurRegions) || body.blurRegions.length > 8 || !body.blurRegions.every(isTranslateRect)) {
      return NextResponse.json({ error: "Blur areas are invalid (maximum 8)." }, { status: 400 });
    }
    patch.blur_regions = body.blurRegions;
  }
  if (body.unitTexts !== undefined) {
    if (!Array.isArray(body.unitTexts) || body.unitTexts.some((item: unknown) => {
      const entry = item as { id?: unknown; text?: unknown };
      return !Number.isInteger(entry?.id) || typeof entry?.text !== "string" || entry.text.length > 2000;
    })) return NextResponse.json({ error: "Unit text is invalid." }, { status: 400 });
    const edits = new Map((body.unitTexts as { id: number; text: string }[]).map((item) => [item.id, item.text.trim()]));
    patch.units = (current.units as RecapV2Unit[]).map((unit) => edits.has(unit.id) ? { ...unit, text: edits.get(unit.id)! } : unit);
  }
  if (body.unitMutes !== undefined) {
    if (!Array.isArray(body.unitMutes) || body.unitMutes.some((item: unknown) => {
      const entry = item as { id?: unknown; muted?: unknown };
      return !Number.isInteger(entry?.id) || typeof entry?.muted !== "boolean";
    })) return NextResponse.json({ error: "Line mute settings are invalid." }, { status: 400 });
    const mutes = new Map((body.unitMutes as { id: number; muted: boolean }[]).map((item) => [item.id, item.muted]));
    patch.units = ((patch.units ?? current.units) as RecapV2Unit[]).map((unit) => mutes.has(unit.id) ? { ...unit, muted: mutes.get(unit.id) } : unit);
  }
  const { data, error } = await db.from("recap_v2_projects").update(patch).eq("id", id).eq("updated_at", current.updated_at).select("*").maybeSingle();
  if (!error && !data) return NextResponse.json({ error: "Project changed. Refresh and try again." }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not save project." }, { status: 500 });
  return NextResponse.json(mapRecapV2Project(data));
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("recap_v2_projects").select("source_object_key,source_upload_id,job_status,updated_at").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (recapV2JobRunning(data)) return NextResponse.json({ error: "Wait for the current step to finish." }, { status: 409 });
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id);
    await deletePrefix(recapV2ProjectPrefix(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove project files." }, { status: 502 });
  }
  const removed = await db.from("recap_v2_projects").delete().eq("id", id);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json(null);
}
