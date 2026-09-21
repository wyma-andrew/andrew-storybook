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
import { supabaseRoute } from "@/lib/supabase/route";

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
  if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
  if (watermarkText === null) return NextResponse.json({ error: "Watermark text must be text or empty." }, { status: 400 });

  const db = await supabaseRoute();
  const { data: project, error: projectError } = await db
    .from("movie_recap_projects")
    .select("logo_enabled, logo_file_name, logo_object_key, logo_url, logo_content_type, logo_size_bytes, logo_watermark_text, logo_placement, logo_opacity")
    .eq("id", projectId)
    .single();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 404 });
  if (!project.logo_object_key || !project.logo_url || !project.logo_file_name || !project.logo_content_type || !project.logo_size_bytes) {
    return NextResponse.json({ error: "Upload a logo before saving a template." }, { status: 400 });
  }
  if (!isLogoContentType(project.logo_content_type)) {
    return NextResponse.json({ error: "The project logo type is not supported." }, { status: 400 });
  }

  const bytes = await getObjectBytes(project.logo_object_key);
  if (!bytes) return NextResponse.json({ error: "The project logo could not be read from storage." }, { status: 502 });

  const templateId = crypto.randomUUID();
  const objectKey = movieRecapLogoTemplateObjectKey(templateId, project.logo_file_name);
  const url = publicUrlFor(objectKey);
  try {
    await putObject(objectKey, bytes, project.logo_content_type);
    const { data, error } = await db
      .from("movie_recap_logo_templates")
      .insert({
        id: templateId,
        owner_id: user!.id,
        name,
        logo_file_name: project.logo_file_name,
        logo_object_key: objectKey,
        logo_url: url,
        logo_content_type: project.logo_content_type,
        logo_size_bytes: project.logo_size_bytes,
        logo_enabled: project.logo_enabled,
        logo_watermark_text: watermarkText ?? project.logo_watermark_text,
        logo_placement: project.logo_placement,
        logo_opacity: project.logo_opacity,
      })
      .select("*")
      .single();
    if (error) throw error;
    const { error: linkError } = await db
      .from("movie_recap_projects")
      .update({ logo_template_id: templateId, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (linkError) {
      await db.from("movie_recap_logo_templates").delete().eq("id", templateId);
      throw linkError;
    }
    return NextResponse.json(mapMovieRecapLogoTemplate(data));
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the template." }, { status: 500 });
  }
}
