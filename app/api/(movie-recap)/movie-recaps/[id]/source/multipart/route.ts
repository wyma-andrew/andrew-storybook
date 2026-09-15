import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { abortMultipartUpload, createMultipartUpload, listMultipartParts } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

async function ownedProject(id: string) {
  const db = await supabaseRoute();
  const result = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  return { db, ...result };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await ownedProject(id);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Project not found." }, { status: 404 });
  if (!data.source_upload_id) return NextResponse.json({ parts: [] });
  try {
    return NextResponse.json({ parts: await listMultipartParts(data.source_object_key, data.source_upload_id) });
  } catch {
    return NextResponse.json({ error: "The saved multipart upload has expired. Restart the upload." }, { status: 409 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, data, error } = await ownedProject(id);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Project not found." }, { status: 404 });
  try {
    if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id).catch(() => undefined);
    const uploadId = await createMultipartUpload(data.source_object_key, data.source_content_type);
    const { data: updated, error: updateError } = await db
      .from("movie_recap_projects")
      .update({ source_upload_id: uploadId, source_upload_status: "uploading", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return NextResponse.json(mapMovieRecapProject(updated));
  } catch (startError) {
    return NextResponse.json({ error: startError instanceof Error ? startError.message : "Could not start upload." }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, data, error } = await ownedProject(id);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Project not found." }, { status: 404 });
  if (data.source_upload_id) await abortMultipartUpload(data.source_object_key, data.source_upload_id).catch(() => undefined);
  const { error: updateError } = await db
    .from("movie_recap_projects")
    .update({ source_upload_id: null, source_upload_status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(null);
}
