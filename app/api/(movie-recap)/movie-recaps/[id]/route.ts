import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import {
  isMovieRecapAspectRatio,
  isMovieRecapLogoPlacement,
  isMovieRecapSubtitleMode,
} from "@/lib/constants/movie-recap";
import { abortMultipartUpload, deleteObject } from "@/lib/r2";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(mapMovieRecapProject(data));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const db = await supabaseRoute();
  const { data: current, error: currentError } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let changesConfiguration = false;
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    patch.name = name;
    changesConfiguration = true;
  }
  if (body?.outputLanguage !== undefined) {
    if (body.outputLanguage !== "my") return NextResponse.json({ error: "Only Burmese is supported." }, { status: 400 });
    patch.output_language = body.outputLanguage;
    changesConfiguration = true;
  }
  if (body?.voiceProfileId !== undefined) {
    if (body.voiceProfileId !== "narrator") return NextResponse.json({ error: "Invalid voice profile." }, { status: 400 });
    patch.voice_profile_id = body.voiceProfileId;
    changesConfiguration = true;
  }
  if (body?.aspectRatio !== undefined) {
    if (!isMovieRecapAspectRatio(body.aspectRatio)) return NextResponse.json({ error: "Invalid aspect ratio." }, { status: 400 });
    patch.aspect_ratio = body.aspectRatio;
    changesConfiguration = true;
  }
  if (body?.subtitleMode !== undefined) {
    if (!isMovieRecapSubtitleMode(body.subtitleMode)) return NextResponse.json({ error: "Invalid subtitle mode." }, { status: 400 });
    patch.subtitle_mode = body.subtitleMode;
    changesConfiguration = true;
  }
  if (body?.logoPlacement !== undefined) {
    if (!isMovieRecapLogoPlacement(body.logoPlacement)) return NextResponse.json({ error: "Invalid logo placement." }, { status: 400 });
    patch.logo_placement = body.logoPlacement;
    changesConfiguration = true;
  }
  for (const [client, column] of [["logoEnabled", "logo_enabled"], ["blurEnabled", "blur_enabled"], ["copyrightFree", "copyright_free"]] as const) {
    if (body?.[client] !== undefined) {
      if (typeof body[client] !== "boolean") return NextResponse.json({ error: `${client} must be boolean.` }, { status: 400 });
      patch[column] = body[client];
      changesConfiguration = true;
    }
  }
  if (body?.logoOpacity !== undefined) {
    const value = Number(body.logoOpacity);
    if (!Number.isInteger(value) || value < 0 || value > 100) return NextResponse.json({ error: "Logo opacity must be 0–100." }, { status: 400 });
    patch.logo_opacity = value;
    changesConfiguration = true;
  }

  const blur = {
    x: body?.blurX === undefined ? Number(current.blur_x) : Number(body.blurX),
    y: body?.blurY === undefined ? Number(current.blur_y) : Number(body.blurY),
    width: body?.blurWidth === undefined ? Number(current.blur_width) : Number(body.blurWidth),
    height: body?.blurHeight === undefined ? Number(current.blur_height) : Number(body.blurHeight),
  };
  if (["blurX", "blurY", "blurWidth", "blurHeight"].some((key) => body?.[key] !== undefined)) {
    if (!Object.values(blur).every(Number.isFinite) || blur.width < 5 || blur.height < 5 || blur.x < 0 || blur.y < 0 || blur.x + blur.width > 100 || blur.y + blur.height > 100) {
      return NextResponse.json({ error: "Blur area must stay inside the video frame." }, { status: 400 });
    }
    Object.assign(patch, { blur_x: blur.x, blur_y: blur.y, blur_width: blur.width, blur_height: blur.height });
    changesConfiguration = true;
  }
  if (body?.currentStep !== undefined) {
    const step = Number(body.currentStep);
    if (!Number.isInteger(step) || step < 1 || step > 4) return NextResponse.json({ error: "Invalid wizard step." }, { status: 400 });
    patch.current_step = step;
  }
  if (body?.status !== undefined) {
    if (body.status !== "draft" && body.status !== "ready_for_generation") {
      return NextResponse.json({ error: "Invalid project status." }, { status: 400 });
    }
    if (body.status === "ready_for_generation") {
      if (current.source_upload_status !== "ready") return NextResponse.json({ error: "The source video is not ready." }, { status: 400 });
      const logoEnabled = (patch.logo_enabled as boolean | undefined) ?? current.logo_enabled;
      if (logoEnabled && !current.logo_url) return NextResponse.json({ error: "Upload a brand logo before generating." }, { status: 400 });
    }
    patch.status = body.status;
  } else if (changesConfiguration) {
    patch.status = "draft";
  }

  const { data, error } = await db.from("movie_recap_projects").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapMovieRecapProject(data));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: project, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  try {
    if (project.source_upload_id) await abortMultipartUpload(project.source_object_key, project.source_upload_id);
    if (project.source_url) await deleteObject(project.source_object_key);
    if (project.logo_object_key) await deleteObject(project.logo_object_key);
  } catch (storageError) {
    return NextResponse.json({ error: storageError instanceof Error ? storageError.message : "Could not remove stored files." }, { status: 502 });
  }
  const { error: deleteError } = await db.from("movie_recap_projects").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json(null);
}
