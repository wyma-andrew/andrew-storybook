import { NextRequest, NextResponse } from "next/server";
import { isLogoContentType, movieRecapObjectKey, presignPut, publicUrlFor } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

const MAX_LOGO_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName.trim().slice(0, 300) : "";
  const contentType = body?.contentType;
  const sizeBytes = Number(body?.sizeBytes);
  if (!fileName || !isLogoContentType(contentType) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: "Logo must be a PNG, JPEG, or WebP file no larger than 10 MB." }, { status: 400 });
  }
  const db = await supabaseRoute();
  const { error } = await db.from("movie_recap_projects").select("id").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const objectKey = movieRecapObjectKey(id, "logo", fileName);
  return NextResponse.json({
    fileName,
    objectKey,
    contentType,
    url: publicUrlFor(objectKey),
    uploadUrl: await presignPut(objectKey, contentType),
  });
}
