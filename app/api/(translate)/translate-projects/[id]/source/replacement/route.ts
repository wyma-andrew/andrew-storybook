import { NextRequest, NextResponse } from "next/server";
import { abortMultipartUpload, createMultipartUpload, isVideoContentType, listMultipartParts, translateObjectKey } from "@/lib/r2";
import { mapTranslateProject, type TranslateVideoReplacement } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data } = await db.from("translate_projects").select("source_replacement").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const replacement = data.source_replacement as TranslateVideoReplacement | null;
  if (!replacement) return NextResponse.json({ error: "No video replacement is in progress." }, { status: 409 });
  try {
    return NextResponse.json({ parts: await listMultipartParts(replacement.objectKey, replacement.uploadId) });
  } catch {
    return NextResponse.json({ error: "Replacement upload expired. Choose the video again." }, { status: 409 });
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  const { id } = await params;
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
    || width * height > 7680 * 4320 || !Number.isSafeInteger(lastModified)) {
    return NextResponse.json({ error: "Choose a valid video file." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { data: current } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (current.source_upload_status !== "ready") return NextResponse.json({ error: "Finish the current video upload first." }, { status: 409 });
  if (current.render_status === "running" && Date.now() - Date.parse(current.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
  }
  const objectKey = translateObjectKey(id, "source", fileName);
  try {
    const uploadId = await createMultipartUpload(objectKey, body.contentType);
    const replacement: TranslateVideoReplacement = { objectKey, uploadId, fileName, contentType: body.contentType,
      sizeBytes, durationSeconds, width, height, lastModified };
    const { data, error } = await db.from("translate_projects").update({ source_replacement: replacement, updated_at: new Date().toISOString() })
      .eq("id", id).eq("updated_at", current.updated_at).select("*").maybeSingle();
    if (error || !data) {
      await abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
      return NextResponse.json({ error: error?.message ?? "Project changed. Refresh and try again." }, { status: error ? 500 : 409 });
    }
    const previous = current.source_replacement as TranslateVideoReplacement | null;
    if (previous) await abortMultipartUpload(previous.objectKey, previous.uploadId).catch(() => undefined);
    return NextResponse.json(mapTranslateProject(data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start video replacement." }, { status: 502 });
  }
}
