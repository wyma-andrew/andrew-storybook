import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { createMultipartUpload, isVideoContentType, r2Configured, transcriptObjectKey } from "@/lib/r2";
import { mapTranscriptProject, mapTranscriptProjectListItem, TRANSCRIPT_LIST_COLUMNS } from "@/lib/transcript-project";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const db = await supabaseRoute();
  const { data, error } = await db.from("transcript_projects").select(TRANSCRIPT_LIST_COLUMNS).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapTranscriptProjectListItem));
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  if (!r2Configured()) return NextResponse.json({ error: "Video storage is not configured." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 300) : "";
  const sizeBytes = Number(body?.sizeBytes);
  const durationSeconds = Number(body?.durationSeconds);
  const width = Number(body?.width);
  const height = Number(body?.height);
  const lastModified = Number(body?.lastModified);
  if (!fileName || !isVideoContentType(body?.contentType) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 5 * 1024 ** 4 - 5 * 1024 ** 3
    || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 24 * 60 * 60
    || !Number.isSafeInteger(width) || width <= 0 || width > 7680 || !Number.isSafeInteger(height) || height <= 0 || height > 7680
    || width * height > 7680 * 4320
    || !Number.isSafeInteger(lastModified)) {
    return NextResponse.json({ error: "Choose a valid video file." }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const objectKey = transcriptObjectKey(id, fileName);
  const db = await supabaseRoute();
  const { data, error } = await db.from("transcript_projects").insert({
    id,
    owner_id: user!.id,
    name: fileName.replace(/\.[^.]+$/, "").slice(0, 200) || fileName.slice(0, 200),
    source_file_name: fileName,
    source_object_key: objectKey,
    source_content_type: body.contentType,
    source_size_bytes: sizeBytes,
    source_duration_seconds: durationSeconds,
    source_last_modified: lastModified,
    source_width: width,
    source_height: height,
  }).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create project." }, { status: 500 });
  try {
    const uploadId = await createMultipartUpload(objectKey, body.contentType);
    const updated = await db.from("transcript_projects").update({ source_upload_id: uploadId, source_upload_status: "uploading" }).eq("id", id).select("*").single();
    if (updated.error || !updated.data) throw updated.error ?? new Error("Could not save upload state.");
    return NextResponse.json(mapTranscriptProject(updated.data));
  } catch (uploadError) {
    await db.from("transcript_projects").update({ source_upload_status: "failed" }).eq("id", id);
    return NextResponse.json({ error: uploadError instanceof Error ? uploadError.message : "Could not start upload.", projectId: id }, { status: 502 });
  }
}
