import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { deleteObject, isLogoContentType, publicUrlFor } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const prefix = `movie-recaps/${id}/logo/`;
  const objectKey = typeof body?.objectKey === "string" ? body.objectKey : "";
  const contentType = body?.contentType;
  const sizeBytes = Number(body?.sizeBytes);
  if (
    !objectKey.startsWith(prefix) ||
    body?.url !== publicUrlFor(objectKey) ||
    typeof body?.fileName !== "string" ||
    !isLogoContentType(contentType) ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > 10 * 1024 * 1024
  ) {
    return NextResponse.json({ error: "Invalid logo upload." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data: current, error: currentError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 });
  const { data, error } = await db
    .from("movie_recap_projects")
    .update({
      logo_file_name: body.fileName.slice(0, 300),
      logo_object_key: objectKey,
      logo_url: body.url,
      logo_content_type: contentType,
      logo_size_bytes: sizeBytes,
      logo_template_id: null,
      logo_enabled: false,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (current.logo_object_key && current.logo_object_key !== objectKey) {
    await deleteObject(current.logo_object_key).catch(() => undefined);
  }
  return NextResponse.json(mapMovieRecapProject(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current, error: currentError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 });
  if (current.logo_object_key) {
    try {
      await deleteObject(current.logo_object_key);
    } catch (storageError) {
      return NextResponse.json({ error: storageError instanceof Error ? storageError.message : "Could not remove logo." }, { status: 502 });
    }
  }
  const { data, error } = await db
    .from("movie_recap_projects")
    .update({
      logo_file_name: null,
      logo_object_key: null,
      logo_url: null,
      logo_content_type: null,
      logo_size_bytes: null,
      logo_template_id: null,
      logo_enabled: false,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}
