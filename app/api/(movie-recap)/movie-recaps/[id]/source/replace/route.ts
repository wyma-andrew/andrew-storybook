import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import {
  abortMultipartUpload,
  createMultipartUpload,
  deleteObject,
  deletePrefix,
  isVideoContentType,
  movieRecapAssetPrefix,
  movieRecapObjectKey,
  movieRecapProjectPrefix,
  r2Configured,
} from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

const MAX_R2_OBJECT_SIZE = 5 * 1024 ** 4 - 5 * 1024 ** 3;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "Movie storage is not configured — set R2_* in .env." }, { status: 503 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 300) : "";
  const contentType = body?.contentType;
  const sizeBytes = Number(body?.sizeBytes);
  const durationSeconds = Number(body?.durationSeconds);
  const lastModified = Number(body?.lastModified);
  const keepScript = body?.mode === "same";
  if (!fileName || !isVideoContentType(contentType)) {
    return NextResponse.json({ error: "Choose a valid video file." }, { status: 400 });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_R2_OBJECT_SIZE) {
    return NextResponse.json({ error: "The video size is outside R2's supported range." }, { status: 400 });
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(lastModified)) {
    return NextResponse.json({ error: "The video metadata is invalid." }, { status: 400 });
  }

  const width = Number(body?.width);
  const height = Number(body?.height);
  const hasDimensions = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const db = await supabaseRoute();
  const { data: project, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: error?.message ?? "Project not found." }, { status: 404 });
  if ([project.transcript_status, project.script_status, project.render_status].includes("running")) {
    return NextResponse.json({ error: "Cancel the active transcript, script, or render job before replacing the source." }, { status: 409 });
  }

  const objectKey = movieRecapObjectKey(id, "source", fileName);
  let uploadId: string;
  try {
    uploadId = await createMultipartUpload(objectKey, contentType);
  } catch (startError) {
    return NextResponse.json({ error: startError instanceof Error ? startError.message : "Could not start upload." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from("movie_recap_projects")
    .update({
      source_file_name: fileName,
      source_object_key: objectKey,
      source_url: null,
      source_content_type: contentType,
      source_size_bytes: sizeBytes,
      source_duration_seconds: durationSeconds,
      source_width: hasDimensions ? Math.round(width) : null,
      source_height: hasDimensions ? Math.round(height) : null,
      source_last_modified: lastModified,
      source_upload_id: uploadId,
      source_upload_status: "uploading",
      cover_object_key: null,
      cover_url: null,
      ...(keepScript
        ? {}
        : {
            script_status: "idle",
            script_stage: null,
            script_progress_current: null,
            script_progress_total: null,
            script_error: null,
            script_approved: false,
            render_script: null,
            current_step: 1,
            max_step: 1,
          }),
      render_status: "idle",
      render_is_mock: false,
      render_error: null,
      render_stage: null,
      render_progress_current: null,
      render_progress_total: null,
      render_transcript: null,
      render_analysis_key: null,
      render_output_url: null,
      render_output_object_key: null,
      render_audio_url: null,
      render_audio_object_key: null,
      render_footage_url: null,
      render_footage_object_key: null,
      render_started_at: null,
      render_completed_at: null,
      status: "draft",
      updated_at: now,
    })
    .eq("id", id)
    .neq("transcript_status", "running")
    .neq("script_status", "running")
    .neq("render_status", "running")
    .select("*")
    .single();

  if (updateError || !updated) {
    await abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
    return NextResponse.json({ error: updateError?.message ?? "A project job started before the source could be replaced." }, { status: 409 });
  }

  if (project.source_upload_id) {
    await abortMultipartUpload(project.source_object_key, project.source_upload_id).catch(() => undefined);
  }
  const cleanup = await Promise.allSettled([
    deleteObject(project.source_object_key),
    deletePrefix(movieRecapAssetPrefix(id, "analysis")),
    deletePrefix(movieRecapAssetPrefix(id, "render")),
    deletePrefix(movieRecapAssetPrefix(id, "subtitle")),
    deletePrefix(`${movieRecapProjectPrefix(id)}cover/`),
  ]);
  for (const result of cleanup) {
    if (result.status === "rejected") console.error("[MovieRecapSourceReplace] cleanup failed", result.reason);
  }

  return NextResponse.json(mapMovieRecapProject(updated));
}
