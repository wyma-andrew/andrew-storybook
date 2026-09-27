import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload, objectExists, publicUrlFor } from "@/lib/r2";
import { mapTranslateProject, type TranslateVideoReplacement } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parts = body?.parts;
  if (!Array.isArray(parts) || !parts.length || parts.some((part) => !Number.isInteger(part.partNumber) || typeof part.etag !== "string")) {
    return NextResponse.json({ error: "Completed upload parts are invalid." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data: current } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const replacement = current.source_replacement as TranslateVideoReplacement | null;
  if (!replacement) return NextResponse.json({ error: "No video replacement is in progress." }, { status: 409 });
  if (current.render_status === "running" && Date.now() - Date.parse(current.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
  }
  try {
    try {
      await completeMultipartUpload(replacement.objectKey, replacement.uploadId, parts);
    } catch (error) {
      if (!(await objectExists(replacement.objectKey))) throw error;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: latest } = attempt === 0 ? { data: current } : await db.from("translate_projects").select("*").eq("id", id).single();
      if (!latest || (latest.source_replacement as TranslateVideoReplacement | null)?.objectKey !== replacement.objectKey) {
        return NextResponse.json({ error: "Replacement changed. Refresh and try again." }, { status: 409 });
      }
      if (latest.render_status === "running" && Date.now() - Date.parse(latest.updated_at) < 2 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
      }
      const { data, error } = await db.from("translate_projects").update({
        source_object_key: replacement.objectKey,
        source_url: publicUrlFor(replacement.objectKey),
        source_file_name: replacement.fileName,
        source_content_type: replacement.contentType,
        source_size_bytes: replacement.sizeBytes,
        source_duration_seconds: replacement.durationSeconds,
        source_last_modified: replacement.lastModified,
        source_width: replacement.width,
        source_height: replacement.height,
        source_replacement: null,
        render_status: "idle",
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("updated_at", latest.updated_at).select("*").maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data) return NextResponse.json(mapTranslateProject(data));
    }
    return NextResponse.json({ error: "Project changed. Refresh and try again." }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not finish video replacement." }, { status: 502 });
  }
}
