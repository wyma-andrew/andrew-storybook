import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, deletePrefix, splitterProjectPrefix } from "@/lib/r2";
import { mapSplitterProject, splitterJobRunning } from "@/lib/splitter";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("splitter_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(mapSplitterProject(data));
}

const CHOICES = [
  ["aspectRatio", "aspect_ratio", ["16:9", "9:16", "1:1", "original"]],
  ["fitMode", "fit_mode", ["blur", "bars", "cover"]],
  ["quality", "quality", ["1080", "720", "480"]],
] as const;

const NUMBERS = [
  ["partMinutes", "part_minutes", 0.5, 60], ["smartCutSeconds", "smart_cut_seconds", 1, 120],
  ["textSize", "text_size", 1, 20], ["textOpacity", "text_opacity", 0.1, 1], ["textX", "text_x", 0, 100], ["textY", "text_y", 0, 100],
  ["partNumberSize", "part_number_size", 1, 20], ["partNumberX", "part_number_x", 0, 100], ["partNumberY", "part_number_y", 0, 100],
] as const;

const FLAGS = [["smartCut", "smart_cut"], ["textBox", "text_box"], ["partNumberEnabled", "part_number_enabled"]] as const;

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current } = await db.from("splitter_projects").select("*").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (splitterJobRunning(current)) return NextResponse.json({ error: "Wait for the split to finish." }, { status: 409 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    patch.name = body.name.trim().slice(0, 200);
  }
  for (const [client, column, allowed] of CHOICES) {
    if (body[client] === undefined) continue;
    if (!(allowed as readonly string[]).includes(body[client])) return NextResponse.json({ error: `${client} is invalid.` }, { status: 400 });
    patch[column] = body[client];
  }
  for (const [client, column, min, max] of NUMBERS) {
    if (body[client] === undefined) continue;
    const value = body[client];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return NextResponse.json({ error: `${client} must be ${min}–${max}.` }, { status: 400 });
    patch[column] = value;
  }
  for (const [client, column] of FLAGS) {
    if (body[client] === undefined) continue;
    if (typeof body[client] !== "boolean") return NextResponse.json({ error: `${client} must be true or false.` }, { status: 400 });
    patch[column] = body[client];
  }
  for (const [client, column] of [["textValue", "text_value"], ["partNumberTemplate", "part_number_template"]] as const) {
    if (body[client] === undefined) continue;
    if (typeof body[client] !== "string" || body[client].length > 300) return NextResponse.json({ error: `${client} must be text of at most 300 characters.` }, { status: 400 });
    patch[column] = body[client];
  }
  const { data, error } = await db.from("splitter_projects").update(patch).eq("id", id).eq("updated_at", current.updated_at).select("*").maybeSingle();
  if (!error && !data) return NextResponse.json({ error: "Project changed. Refresh and try again." }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not save." }, { status: 500 });
  return NextResponse.json(mapSplitterProject(data));
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("splitter_projects").select("source_object_key,source_upload_id,job_status,updated_at").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (splitterJobRunning(data)) return NextResponse.json({ error: "Wait for the split to finish." }, { status: 409 });
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id);
    await deletePrefix(splitterProjectPrefix(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove project files." }, { status: 502 });
  }
  const removed = await db.from("splitter_projects").delete().eq("id", id);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json(null);
}
