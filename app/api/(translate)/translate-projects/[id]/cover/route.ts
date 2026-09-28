import { NextRequest, NextResponse } from "next/server";
import { deleteObject, putObject, translateProjectPrefix } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapTranslateProject } from "@/lib/translate";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const imageBase64 = body?.imageBase64;
  if (typeof body?.sourceObjectKey !== "string" || typeof imageBase64 !== "string" || imageBase64.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    return NextResponse.json({ error: "Invalid cover image." }, { status: 400 });
  }
  const image = Buffer.from(imageBase64, "base64");
  if (image.length === 0 || image.length > 1_000_000 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    return NextResponse.json({ error: "Cover must be a JPEG under 1 MB." }, { status: 400 });
  }

  const db = await supabaseRoute();
  const { data: current, error: readError } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (readError || !current) return NextResponse.json({ error: readError?.message ?? "Project not found." }, { status: 404 });
  if (current.source_upload_status !== "ready" || current.source_object_key !== body.sourceObjectKey) {
    return NextResponse.json({ error: "The source video changed before its cover was saved." }, { status: 409 });
  }

  const objectKey = `${translateProjectPrefix(id)}cover/${crypto.randomUUID()}.jpg`;
  try {
    const url = await putObject(objectKey, image, "image/jpeg");
    const { data, error } = await db.from("translate_projects")
      .update({ cover_object_key: objectKey, cover_url: url })
      .eq("id", id)
      .eq("source_object_key", body.sourceObjectKey)
      .eq("source_upload_status", "ready")
      .select("*")
      .maybeSingle();
    if (error || !data) {
      await deleteObject(objectKey).catch(() => undefined);
      return NextResponse.json({ error: error?.message ?? "The source video changed before its cover was saved." }, { status: error ? 500 : 409 });
    }
    if (current.cover_object_key && current.cover_object_key !== objectKey) {
      await deleteObject(current.cover_object_key).catch(() => undefined);
    }
    return NextResponse.json(mapTranslateProject(data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save cover image." }, { status: 502 });
  }
}
