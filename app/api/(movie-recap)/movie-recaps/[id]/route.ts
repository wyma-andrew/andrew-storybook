import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import {
  isMovieRecapAspectRatio,
  isMovieRecapFitMode,
  isMovieRecapLogoPlacement,
  isMovieRecapSubtitlePosition,
  isMovieRecapSubtitlePreset,
} from "@/lib/constants/movie-recap";
import { abortMultipartUpload, deletePrefix, movieRecapProjectPrefix } from "@/lib/r2";
import { getVoice } from "@/lib/tts/voices";
import { supabaseRoute } from "@/lib/supabase/route";

// A source can carry a logo, a watermark and a burned-in subtitle at once, and
// each blur is a split/crop/overlay in the filter graph — past a handful this is
// a slow render for a frame nobody can read anyway.
const MAX_BLUR_REGIONS = 8;
import type { MovieRecapNarrationSegment } from "@/lib/api/types";

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
    if (!getVoice(body.voiceProfileId, "movie-recap")) {
      return NextResponse.json({ error: "Invalid voice profile." }, { status: 400 });
    }
    patch.voice_profile_id = body.voiceProfileId;
    changesConfiguration = true;
  }
  if (body?.aspectRatio !== undefined) {
    if (!isMovieRecapAspectRatio(body.aspectRatio)) return NextResponse.json({ error: "Invalid aspect ratio." }, { status: 400 });
    patch.aspect_ratio = body.aspectRatio;
    changesConfiguration = true;
  }
  if (body?.fitMode !== undefined) {
    if (!isMovieRecapFitMode(body.fitMode)) return NextResponse.json({ error: "Invalid fit mode." }, { status: 400 });
    patch.fit_mode = body.fitMode;
    changesConfiguration = true;
  }
  if (body?.dynamicBackgroundBlurEnabled !== undefined) {
    if (typeof body.dynamicBackgroundBlurEnabled !== "boolean") return NextResponse.json({ error: "dynamicBackgroundBlurEnabled must be boolean." }, { status: 400 });
    patch.dynamic_background_blur_enabled = body.dynamicBackgroundBlurEnabled;
    changesConfiguration = true;
  }
  if (body?.mirrorEnabled !== undefined) {
    if (typeof body.mirrorEnabled !== "boolean") return NextResponse.json({ error: "mirrorEnabled must be boolean." }, { status: 400 });
    patch.mirror_enabled = body.mirrorEnabled;
    changesConfiguration = true;
  }
  if (body?.subtitlePosition !== undefined) {
    if (!isMovieRecapSubtitlePosition(body.subtitlePosition)) return NextResponse.json({ error: "Invalid subtitle position." }, { status: 400 });
    patch.subtitle_position = body.subtitlePosition;
    changesConfiguration = true;
  }
  if (body?.subtitlePreset !== undefined) {
    if (!isMovieRecapSubtitlePreset(body.subtitlePreset)) return NextResponse.json({ error: "Invalid subtitle preset." }, { status: 400 });
    patch.subtitle_preset = body.subtitlePreset;
    changesConfiguration = true;
  }
  if (body?.subtitleSize !== undefined) {
    if (body.subtitleSize !== null && (typeof body.subtitleSize !== "number" || !Number.isFinite(body.subtitleSize) || body.subtitleSize < 1 || body.subtitleSize > 10)) {
      return NextResponse.json({ error: "subtitleSize must be 1–10 or null." }, { status: 400 });
    }
    patch.subtitle_size = body.subtitleSize;
    changesConfiguration = true;
  }
  if (body?.subtitlesEnabled !== undefined) {
    if (typeof body.subtitlesEnabled !== "boolean") return NextResponse.json({ error: "subtitlesEnabled must be boolean." }, { status: 400 });
    patch.subtitles_enabled = body.subtitlesEnabled;
    changesConfiguration = true;
  }
  if (body?.hookTitle !== undefined) {
    if (body.hookTitle !== null && typeof body.hookTitle !== "string") return NextResponse.json({ error: "hookTitle must be a string or null." }, { status: 400 });
    patch.hook_title = typeof body.hookTitle === "string" ? body.hookTitle.trim().slice(0, 200) || null : null;
    changesConfiguration = true;
  }
  if (body?.hookTitlePosition !== undefined) {
    if (!isMovieRecapSubtitlePosition(body.hookTitlePosition)) return NextResponse.json({ error: "Invalid hook title position." }, { status: 400 });
    patch.hook_title_position = body.hookTitlePosition;
    changesConfiguration = true;
  }
  for (const [client, column, min, max] of [
    ["subtitleOffset", "subtitle_offset", 0, 45],
    ["hookTitleOffset", "hook_title_offset", 0, 45],
    // null is a legal value here: it means the zoom has not been chosen and the
    // recommendation for the fit mode applies.
    ["copyrightZoom", "copyright_zoom", 1, 2],
  ] as const) {
    if (body?.[client] !== undefined) {
      if (client === "copyrightZoom" && body[client] === null) {
        patch[column] = null;
        changesConfiguration = true;
        continue;
      }
      const value = Number(body[client]);
      if (!Number.isFinite(value) || value < min || value > max) {
        return NextResponse.json({ error: `${client} must be ${min}–${max}.` }, { status: 400 });
      }
      patch[column] = value;
      changesConfiguration = true;
    }
  }
  if (body?.logoPlacement !== undefined) {
    if (!isMovieRecapLogoPlacement(body.logoPlacement)) return NextResponse.json({ error: "Invalid logo placement." }, { status: 400 });
    patch.logo_placement = body.logoPlacement;
    changesConfiguration = true;
  }
  for (const [client, column] of [["logoEnabled", "logo_enabled"]] as const) {
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
  if (body?.logoWatermarkText !== undefined) {
    if (body.logoWatermarkText !== null && typeof body.logoWatermarkText !== "string") {
      return NextResponse.json({ error: "Watermark text must be text or empty." }, { status: 400 });
    }
    const value = typeof body.logoWatermarkText === "string" ? body.logoWatermarkText.trim().slice(0, 120) : null;
    patch.logo_watermark_text = value || null;
    changesConfiguration = true;
  }

  if (body?.blurRegions !== undefined) {
    if (!Array.isArray(body.blurRegions)) {
      return NextResponse.json({ error: "blurRegions must be a list." }, { status: 400 });
    }
    if (body.blurRegions.length > MAX_BLUR_REGIONS) {
      return NextResponse.json({ error: `At most ${MAX_BLUR_REGIONS} blur areas.` }, { status: 400 });
    }
    const regions = [];
    for (const raw of body.blurRegions) {
      const region = { x: Number(raw?.x), y: Number(raw?.y), width: Number(raw?.width), height: Number(raw?.height) };
      if (
        !Object.values(region).every(Number.isFinite) ||
        region.width < 5 ||
        region.height < 5 ||
        region.x < 0 ||
        region.y < 0 ||
        region.x + region.width > 100 ||
        region.y + region.height > 100
      ) {
        return NextResponse.json({ error: "Every blur area must stay inside the video frame." }, { status: 400 });
      }
      regions.push(region);
    }
    patch.blur_regions = regions;
    changesConfiguration = true;
  }
  // The script is editable so an awkward line can be fixed without rerolling the
  // whole recap. Only the TEXT is taken: the shot list is the render's own
  // planning output, timed against the source, and a browser has no business
  // rewriting it. Deliberately does NOT set changesConfiguration: re-rendering
  // the script is the point, not a reason to demote an approved project.
  if (body?.renderScript !== undefined) {
    const current_script = (current.render_script ?? null) as MovieRecapNarrationSegment[] | null;
    if (!Array.isArray(body.renderScript) || !current_script) {
      return NextResponse.json({ error: "There is no rendered script to edit." }, { status: 400 });
    }
    if (body.renderScript.length !== current_script.length) {
      return NextResponse.json({ error: "The edited script must keep every beat." }, { status: 400 });
    }
    const edited: MovieRecapNarrationSegment[] = [];
    for (const [index, beat] of (body.renderScript as { text?: unknown }[]).entries()) {
      const text = typeof beat?.text === "string" ? beat.text.trim() : "";
      if (!text) return NextResponse.json({ error: `Beat ${index + 1} is empty.` }, { status: 400 });
      edited.push({ ...current_script[index], text: text.slice(0, 600) });
    }
    patch.render_script = edited;
  }
  // Typed in by hand at the Transcript step. Deliberately does NOT set
  // changesConfiguration: the render does not read either of these, so editing
  // them is no reason to demote an approved project to draft.
  for (const [client, column] of [["transcriptText", "transcript_text"], ["transcriptStory", "transcript_story"]] as const) {
    if (body?.[client] !== undefined) {
      if (typeof body[client] !== "string") return NextResponse.json({ error: `${client} must be text.` }, { status: 400 });
      patch[column] = body[client].trim() || null;
    }
  }
  if (body?.currentStep !== undefined) {
    const step = Number(body.currentStep);
    if (!Number.isInteger(step) || step < 1 || step > 5) return NextResponse.json({ error: "Invalid wizard step." }, { status: 400 });
    patch.current_step = step;
    patch.max_step = Math.max(Number(current.max_step ?? current.current_step), step);
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
    // Everything under the project's prefix, not the keys the row happens to
    // hold: every superseded render output and its subtitles are objects no
    // column tracks, and deleting key by key leaks exactly those.
    await deletePrefix(movieRecapProjectPrefix(id));
  } catch (storageError) {
    return NextResponse.json({ error: storageError instanceof Error ? storageError.message : "Could not remove stored files." }, { status: 502 });
  }
  const { error: deleteError } = await db.from("movie_recap_projects").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json(null);
}
