import { NextRequest, NextResponse } from "next/server";
import { deleteObject, putObject, recapV2ObjectKey } from "@/lib/r2";
import { mapRecapV2Project } from "@/lib/recap-v2";
import { supabaseRoute } from "@/lib/supabase/route";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const imageBase64 = body?.imageBase64;
  if (typeof body?.fileName !== "string" || !LOGO_TYPES.has(body?.contentType) || typeof imageBase64 !== "string"
    || imageBase64.length > MAX_LOGO_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    return NextResponse.json({ error: "The logo must be a PNG, JPEG or WebP under 2 MB." }, { status: 400 });
  }
  const image = Buffer.from(imageBase64, "base64");
  if (!image.length || image.length > MAX_LOGO_BYTES) return NextResponse.json({ error: "The logo must be under 2 MB." }, { status: 400 });

  const db = await supabaseRoute();
  const { data: current } = await db.from("recap_v2_projects").select("logo_object_key").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const objectKey = recapV2ObjectKey(id, "logo", body.fileName);
  try {
    const url = await putObject(objectKey, image, body.contentType);
    const { data, error } = await db.from("recap_v2_projects")
      .update({ logo_object_key: objectKey, logo_url: url, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (error || !data) {
      await deleteObject(objectKey).catch(() => undefined);
      return NextResponse.json({ error: error?.message ?? "Could not save the logo." }, { status: 500 });
    }
    if (current.logo_object_key) await deleteObject(current.logo_object_key).catch(() => undefined);
    return NextResponse.json(mapRecapV2Project(data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the logo." }, { status: 502 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current } = await db.from("recap_v2_projects").select("logo_object_key").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (current.logo_object_key) await deleteObject(current.logo_object_key).catch(() => undefined);
  const { data, error } = await db.from("recap_v2_projects")
    .update({ logo_object_key: null, logo_url: null, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not remove the logo." }, { status: 500 });
  return NextResponse.json(mapRecapV2Project(data));
}
