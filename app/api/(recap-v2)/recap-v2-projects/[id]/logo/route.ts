import { NextRequest, NextResponse } from "next/server";
import { isUploadableLogoType, parseLogoUpload } from "@/lib/logo-upload";
import { deleteObject, getObjectBytes, putObject, recapV2ObjectKey } from "@/lib/r2";
import { mapRecapV2Project } from "@/lib/recap-v2";
import { supabaseRoute } from "@/lib/supabase/route";

type LogoSource = { fileName: string; contentType: string; image: Buffer; templateId: string | null; watermarkText: string | null };

async function saveLogo(id: string, source: LogoSource) {
  const db = await supabaseRoute();
  const { data: current } = await db.from("recap_v2_projects").select("logo_object_key").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const objectKey = recapV2ObjectKey(id, "logo", source.fileName);
  try {
    const url = await putObject(objectKey, source.image, source.contentType);
    const { data, error } = await db.from("recap_v2_projects")
      .update({
        logo_object_key: objectKey, logo_url: url, logo_enabled: true, logo_template_id: source.templateId,
        ...(source.templateId ? { logo_watermark_text: source.watermarkText } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id).select("*").single();
    if (error || !data) {
      await deleteObject(objectKey).catch(() => undefined);
      return NextResponse.json({ error: error?.message ?? "Could not save the logo." }, { status: 500 });
    }
    if (current.logo_object_key && current.logo_object_key !== objectKey) await deleteObject(current.logo_object_key).catch(() => undefined);
    return NextResponse.json(mapRecapV2Project(data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the logo." }, { status: 502 });
  }
}

// The template's file is copied into the project, so a later template edit or
// delete leaves this project's logo as it was.
async function saveTemplateLogo(id: string, templateId: string) {
  const db = await supabaseRoute();
  const { data: template } = await db.from("movie_recap_logo_templates")
    .select("id, logo_file_name, logo_object_key, logo_content_type, logo_watermark_text").eq("id", templateId).single();
  if (!template) return NextResponse.json({ error: "Logo template not found." }, { status: 404 });
  if (!isUploadableLogoType(template.logo_content_type)) {
    return NextResponse.json({ error: "That template's logo is not a PNG, JPEG or WebP." }, { status: 400 });
  }
  const image = await getObjectBytes(template.logo_object_key);
  if (!image) return NextResponse.json({ error: "The template logo could not be read from storage." }, { status: 502 });
  return saveLogo(id, { fileName: template.logo_file_name, contentType: template.logo_content_type, image, templateId: template.id, watermarkText: template.logo_watermark_text ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.templateId === "string") return saveTemplateLogo(id, body.templateId);
  const upload = parseLogoUpload(body);
  if (typeof upload === "string") return NextResponse.json({ error: upload }, { status: 400 });
  return saveLogo(id, { ...upload, templateId: null, watermarkText: null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: current } = await db.from("recap_v2_projects").select("logo_object_key").eq("id", id).single();
  if (!current) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (current.logo_object_key) await deleteObject(current.logo_object_key).catch(() => undefined);
  const { data, error } = await db.from("recap_v2_projects")
    .update({ logo_object_key: null, logo_url: null, logo_enabled: false, logo_template_id: null, logo_watermark_text: null, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not remove the logo." }, { status: 500 });
  return NextResponse.json(mapRecapV2Project(data));
}
