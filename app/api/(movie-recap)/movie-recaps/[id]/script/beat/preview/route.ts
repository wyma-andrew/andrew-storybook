import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { mapMovieRecapProject } from "@/lib/api/map";
import { narrationClip, renderNarrationClipAtConfiguredRate } from "@/lib/movie-recap-narration";
import { supabaseRoute } from "@/lib/supabase/route";
import { resolveMovieRecapVoice } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const index = Number(body?.index);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Which beat?" }, { status: 400 });
  }

  const db = await supabaseRoute();
  const { data: row, error } = await db.from("movie_recap_projects").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const project = mapMovieRecapProject(row);
  const beat = project.renderScript?.[index];
  if (!beat) return NextResponse.json({ error: "That beat is not in the saved script." }, { status: 404 });
  if (project.scriptStatus === "running" || project.renderStatus === "running") {
    return NextResponse.json({ error: "Wait for the run in progress to finish." }, { status: 409 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "movie-recap-beat-preview-"));
  try {
    const voice = resolveMovieRecapVoice(project.voiceProfileId);
    const clip = await narrationClip({ projectId: project.id, voice, text: beat.text, slot: index, workDir });
    const previewPath = path.join(workDir, `preview-${index}.wav`);
    const durationSeconds = await renderNarrationClipAtConfiguredRate({
      inputPath: clip.path,
      inputDurationS: clip.durationSeconds,
      outputPath: previewPath,
      playbackRate: beat.narrationRate,
    });
    return NextResponse.json({
      audioBase64: (await readFile(previewPath)).toString("base64"),
      contentType: "audio/wav" as const,
      durationSeconds,
      cached: clip.cached,
    });
  } catch (previewError) {
    return NextResponse.json(
      { error: previewError instanceof Error ? previewError.message : "Could not prepare that beat preview." },
      { status: 502 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
