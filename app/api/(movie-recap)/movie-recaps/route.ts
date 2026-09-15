import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth-guard";
import { mapMovieRecapProject } from "@/lib/api/map";
import { createMultipartUpload, isVideoContentType, movieRecapObjectKey, r2Configured } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

const MAX_R2_OBJECT_SIZE = 5 * 1024 ** 4 - 5 * 1024 ** 3;

export async function GET() {
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select("*").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapMovieRecapProject));
}

export async function POST(req: NextRequest) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "Movie storage is not configured — set R2_* in .env." }, { status: 503 });
  }
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;
  const body = await req.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 300) : "";
  const contentType = body?.contentType;
  const sizeBytes = Number(body?.sizeBytes);
  const durationSeconds = Number(body?.durationSeconds);
  const lastModified = Number(body?.lastModified);
  if (!fileName || !isVideoContentType(contentType)) {
    return NextResponse.json({ error: "Choose a valid video file." }, { status: 400 });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_R2_OBJECT_SIZE) {
    return NextResponse.json({ error: "The video size is outside R2's supported range." }, { status: 400 });
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(lastModified)) {
    return NextResponse.json({ error: "The video metadata is invalid." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const objectKey = movieRecapObjectKey(id, "source", fileName);
  const db = await supabaseRoute();
  const { data: inserted, error: insertError } = await db
    .from("movie_recap_projects")
    .insert({
      id,
      owner_id: user.id,
      name: fileName.slice(0, 200),
      source_file_name: fileName,
      source_object_key: objectKey,
      source_content_type: contentType,
      source_size_bytes: sizeBytes,
      source_duration_seconds: durationSeconds,
      source_last_modified: lastModified,
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  try {
    const uploadId = await createMultipartUpload(objectKey, contentType);
    const { data, error } = await db
      .from("movie_recap_projects")
      .update({ source_upload_id: uploadId, source_upload_status: "uploading", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(mapMovieRecapProject(data));
  } catch {
    const { data } = await db
      .from("movie_recap_projects")
      .update({ source_upload_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    return NextResponse.json(mapMovieRecapProject(data ?? inserted));
  }
}
