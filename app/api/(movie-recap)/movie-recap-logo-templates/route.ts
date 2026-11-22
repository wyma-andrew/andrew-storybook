import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { mapMovieRecapLogoTemplate } from "@/lib/api/map";
import {
  deleteObject,
  getObjectBytes,
  isLogoContentType,
  movieRecapLogoTemplateObjectKey,
  publicUrlFor,
  putObject,
} from "@/lib/r2";
import { parseLogoUpload } from "@/lib/logo-upload";
import { supabaseRoute } from "@/lib/supabase/route";

// A template's image comes either inline (Recap V2 and new uploads) or from a
// Movie Recap project's already uploaded logo.
async function projectLogo(db: Awaited<ReturnType<typeof supabaseRoute>>, projectId: string) {
  const { data: project, error } = await db
    .from("movie_recap_projects")
    .select("logo_file_name, logo_object_key, logo_content_type, logo_size_bytes, logo_watermark_text")
    .eq("id", projectId)
    .single();
  if (error) return { error: error.message, status: 404 };
  if (!project.logo_object_key || !project.logo_file_name || !project.logo_content_type || !project.logo_size_bytes) {
    return { error: "Upload a logo before saving a template.", status: 400 };
  }
  if (!isLogoContentType(project.logo_content_type)) return { error: "The project logo type is not supported.", status: 400 };
  const image = await getObjectBytes(project.logo_object_key);
  if (!image) return { error: "The project logo could not be read from storage.", status: 502 };
  return { fileName: project.logo_file_name as string, contentType: project.logo_content_type as string, image, watermarkText: (project.logo_watermark_text as string | null) ?? null };
}

export async function GET() {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const db = await supabaseRoute();
  const { data, error } = await db
    .from("movie_recap_logo_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapMovieRecapLogoTemplate));
}

export async function POST(req: NextRequest) {
  const { user, unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const watermarkText = body?.logoWatermarkText === null || body?.logoWatermarkText === undefined
    ? undefined
    : typeof body.logoWatermarkText === "string" ? body.logoWatermarkText.trim().slice(0, 120) : null;
  if (!name) return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  const upload = body?.imageBase64 === undefined ? null : parseLogoUpload(body);
  if (typeof upload === "string") return NextResponse.json({ error: upload }, { status: 400 });
  if (!upload && !projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
  if (watermarkText === null) return NextResponse.json({ error: "Watermark text must be text or empty." }, { status: 400 });

  const db = await supabaseRoute();
  const logo = upload ?? await projectLogo(db, projectId);
  if ("error" in logo) return NextResponse.json({ error: logo.error }, { status: logo.status });

  const templateId = crypto.randomUUID();
  const objectKey = movieRecapLogoTemplateObjectKey(templateId, logo.fileName);
  const url = publicUrlFor(objectKey);
  try {
    await putObject(objectKey, logo.image, logo.contentType);
    const { data, error } = await db
      .from("movie_recap_logo_templates")
      .insert({
        id: templateId,
        owner_id: user!.id,
        name,
        logo_file_name: logo.fileName,
        logo_object_key: objectKey,
        logo_url: url,
        logo_content_type: logo.contentType,
        logo_size_bytes: logo.image.length,
        logo_watermark_text: watermarkText ?? ("watermarkText" in logo ? logo.watermarkText : null),
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(mapMovieRecapLogoTemplate(data));
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the template." }, { status: 500 });
  }
}
