import { NextResponse } from "next/server";
import { isMovieRecapLogoPlacement } from "@/lib/constants/movie-recap";
import { mapMovieRecapLogoTemplate } from "@/lib/api/map";
import { mapMovieRecapProject } from "@/lib/api/map";
import { requireFeature } from "@/lib/api/auth-guard";
import { deleteObject, getObjectBytes, movieRecapObjectKey, putObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "Project is required." }, { status: 400 });
  if (body?.logoPlacement !== undefined && !isMovieRecapLogoPlacement(body.logoPlacement)) {
    return NextResponse.json({ error: "Invalid logo placement." }, { status: 400 });
  }
  const logoOpacity = body?.logoOpacity === undefined ? undefined : Number(body.logoOpacity);
  if (logoOpacity !== undefined && (!Number.isInteger(logoOpacity) || logoOpacity < 0 || logoOpacity > 100)) {
    return NextResponse.json({ error: "Logo opacity must be 0–100." }, { status: 400 });
  }
  const watermarkText = body?.logoWatermarkText === null || body?.logoWatermarkText === undefined
    ? undefined
    : typeof body.logoWatermarkText === "string" ? body.logoWatermarkText.trim().slice(0, 120) : null;
  if (watermarkText === null) return NextResponse.json({ error: "Watermark text must be text or empty." }, { status: 400 });

  const db = await supabaseRoute();
  const [{ data: template, error: templateError }, { data: project, error: projectError }] = await Promise.all([
    db.from("movie_recap_logo_templates").select("*").eq("id", id).single(),
    db.from("movie_recap_projects").select("*").eq("id", projectId).single(),
  ]);
  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 404 });
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 404 });
  if (!project.logo_object_key || !project.logo_file_name || !project.logo_content_type || !project.logo_size_bytes) {
    return NextResponse.json({ error: "Upload a logo before updating a template." }, { status: 400 });
  }
  const bytes = await getObjectBytes(project.logo_object_key);
  if (!bytes) return NextResponse.json({ error: "The project logo could not be read from storage." }, { status: 502 });
  const objectKey = movieRecapObjectKey(`template-${id}`, "logo", project.logo_file_name);
  try {
    const url = await putObject(objectKey, bytes, project.logo_content_type);
    const { data, error } = await db
      .from("movie_recap_logo_templates")
      .update({
        logo_file_name: project.logo_file_name,
        logo_object_key: objectKey,
        logo_url: url,
        logo_content_type: project.logo_content_type,
        logo_size_bytes: project.logo_size_bytes,
        logo_watermark_text: watermarkText ?? project.logo_watermark_text,
        logo_placement: body?.logoPlacement ?? project.logo_placement,
        logo_opacity: logoOpacity ?? project.logo_opacity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    if (template.logo_object_key) await deleteObject(template.logo_object_key).catch(() => undefined);
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
        logo_placement: template.logo_placement,
        logo_opacity: template.logo_opacity,
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
