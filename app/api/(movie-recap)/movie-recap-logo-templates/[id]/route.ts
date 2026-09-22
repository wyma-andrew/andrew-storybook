import { NextResponse } from "next/server";
import { mapMovieRecapLogoTemplate } from "@/lib/api/map";
import { mapMovieRecapProject } from "@/lib/api/map";
import { requireFeature } from "@/lib/api/auth-guard";
import { deleteObject, getObjectBytes, movieRecapLogoTemplateObjectKey, movieRecapObjectKey, putObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = body?.name === undefined ? undefined : typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name === "") return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  const watermarkText = body?.logoWatermarkText === null || body?.logoWatermarkText === undefined
    ? undefined
    : typeof body.logoWatermarkText === "string" ? body.logoWatermarkText.trim().slice(0, 120) : null;
  if (watermarkText === null) return NextResponse.json({ error: "Watermark text must be text or empty." }, { status: 400 });
  const replaceLogo = body?.replaceLogo === true;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (replaceLogo && !projectId) return NextResponse.json({ error: "Project is required to replace the logo." }, { status: 400 });

  const db = await supabaseRoute();
  const { data: template, error: templateError } = await db.from("movie_recap_logo_templates").select("*").eq("id", id).single();
  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 404 });

  const changes = {
    ...(name === undefined ? {} : { name }),
    ...(watermarkText === undefined ? {} : { logo_watermark_text: watermarkText || null }),
    updated_at: new Date().toISOString(),
  };
  if (!replaceLogo) {
    const { data, error } = await db.from("movie_recap_logo_templates").update(changes).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(mapMovieRecapLogoTemplate(data));
  }

  const { data: project, error: projectError } = await db
    .from("movie_recap_projects")
    .select("logo_file_name, logo_object_key, logo_content_type, logo_size_bytes")
    .eq("id", projectId)
    .single();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 404 });
  if (!project.logo_object_key || !project.logo_file_name || !project.logo_content_type || !project.logo_size_bytes) {
    return NextResponse.json({ error: "Upload a logo before updating a template." }, { status: 400 });
  }
  const bytes = await getObjectBytes(project.logo_object_key);
  if (!bytes) return NextResponse.json({ error: "The project logo could not be read from storage." }, { status: 502 });
  const objectKey = movieRecapLogoTemplateObjectKey(id, project.logo_file_name);
  try {
    const url = await putObject(objectKey, bytes, project.logo_content_type);
    const { data, error } = await db
      .from("movie_recap_logo_templates")
      .update({
        ...changes,
        logo_file_name: project.logo_file_name,
        logo_object_key: objectKey,
        logo_url: url,
        logo_content_type: project.logo_content_type,
        logo_size_bytes: project.logo_size_bytes,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    if (template.logo_object_key && template.logo_object_key !== objectKey) {
      await deleteObject(template.logo_object_key).catch(() => undefined);
    }
    return NextResponse.json(mapMovieRecapLogoTemplate(data));
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the template." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });

  const db = await supabaseRoute();
  const [{ data: template, error: templateError }, { data: project, error: projectError }] = await Promise.all([
    db.from("movie_recap_logo_templates").select("*").eq("id", id).single(),
    db.from("movie_recap_projects").select("*").eq("id", projectId).single(),
  ]);
  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 404 });
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 404 });

  const bytes = await getObjectBytes(template.logo_object_key);
  if (!bytes) return NextResponse.json({ error: "The template logo could not be read from storage." }, { status: 502 });
  const objectKey = movieRecapObjectKey(projectId, "logo", template.logo_file_name);
  try {
    const url = await putObject(objectKey, bytes, template.logo_content_type);
    const { data, error } = await db
      .from("movie_recap_projects")
      .update({
        logo_file_name: template.logo_file_name,
        logo_object_key: objectKey,
        logo_url: url,
        logo_content_type: template.logo_content_type,
        logo_size_bytes: template.logo_size_bytes,
        logo_enabled: true,
        logo_watermark_text: template.logo_watermark_text,
        logo_template_id: id,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .select("*")
      .single();
    if (error) throw error;
    if (project.logo_object_key) await deleteObject(project.logo_object_key).catch(() => undefined);
    return NextResponse.json(mapMovieRecapProject(data));
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not apply the template." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: template, error: readError } = await db
    .from("movie_recap_logo_templates")
    .select("logo_object_key")
    .eq("id", id)
    .single();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });
  if (template.logo_object_key) await deleteObject(template.logo_object_key).catch(() => undefined);
  const { error } = await db.from("movie_recap_logo_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(null);
}
