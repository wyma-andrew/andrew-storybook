import { NextRequest, NextResponse } from "next/server";
import { mapConcurrent } from "@/lib/map-concurrent";
import { translateSrtBatch } from "@/lib/openai";
import { buildTranslateSrtPrompt, mapTranslateProject, mergeSrtBlocks, TRANSLATE_PROMPT_BATCH_SIZE, translateCuesToSrt, validTranslateCues } from "@/lib/translate";
import { supabaseRoute } from "@/lib/supabase/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();
  const { data: row } = await db.from("translate_projects").select("*").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!validTranslateCues(row.subtitle_cues, 24 * 60 * 60) || !row.subtitle_cues.length) {
    return NextResponse.json({ error: "Run Auto Sync before generating a translation." }, { status: 409 });
  }
  if (row.render_status === "running" && Date.now() - Date.parse(row.updated_at) < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Wait for the current render to finish." }, { status: 409 });
  }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "AI translation is not configured." }, { status: 503 });

  const cues = row.subtitle_cues;
  const batches = Array.from({ length: Math.ceil(cues.length / TRANSLATE_PROMPT_BATCH_SIZE) }, (_, batch) => batch * TRANSLATE_PROMPT_BATCH_SIZE);
  try {
    const outputs = await mapConcurrent(batches, 3, async (from) => {
      const batch = cues.slice(from, from + TRANSLATE_PROMPT_BATCH_SIZE);
      return translateSrtBatch(buildTranslateSrtPrompt(translateCuesToSrt(batch, from + 1), from + 1, from + batch.length));
    });
    let text: string | null = row.translated_srt_text;
    let added = 0;
    for (const output of outputs) {
      const merge = mergeSrtBlocks(text, output, cues);
      text = merge.text;
      added += merge.added + merge.updated;
    }
    if (!added || !text) return NextResponse.json({ error: "The AI reply contained no usable SRT blocks." }, { status: 502 });
    const saved = await db.from("translate_projects").update({
      translated_srt_text: text, translated_srt_file_name: row.translated_srt_file_name ?? "translated.srt",
      subtitle_timing_mode: "translated", render_status: "idle", render_error: null,
      render_output_key: null, render_output_url: null, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("updated_at", row.updated_at).select("*").maybeSingle();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    if (!saved.data) return NextResponse.json({ error: "Project changed. Refresh and generate again." }, { status: 409 });
    return NextResponse.json(mapTranslateProject(saved.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI translation failed.";
    return NextResponse.json({ error: message.slice(-500) }, { status: 500 });
  }
}
