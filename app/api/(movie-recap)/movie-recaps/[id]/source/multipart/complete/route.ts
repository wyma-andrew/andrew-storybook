import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { completeMultipartUpload, publicUrlFor } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  if (!parts.length || parts.some((part: Record<string, unknown>) => !Number.isInteger(part.partNumber) || typeof part.etag !== "string")) {
    return NextResponse.json({ error: "Completed upload parts are invalid." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data: project, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error || !project) return NextResponse.json({ error: error?.message ?? "Project not found." }, { status: 404 });
  if (!project.source_upload_id) return NextResponse.json({ error: "No active upload." }, { status: 409 });
  try {
    await completeMultipartUpload(project.source_object_key, project.source_upload_id, parts);
    const { data, error: updateError } = await db
      .from("movie_recap_projects")
      .update({
        source_url: publicUrlFor(project.source_object_key),
        source_upload_id: null,
        source_upload_status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return NextResponse.json(mapMovieRecapProject(data));
  } catch (completeError) {
    return NextResponse.json({ error: completeError instanceof Error ? completeError.message : "Could not complete upload." }, { status: 502 });
  }
}
