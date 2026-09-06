import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";
import { tiptapToText } from "@/lib/tiptap-text";
import { regenerateAssetPrompt } from "@/lib/openai";
import { resolveVisualStyle } from "@/lib/visual-styles";

// Regenerates one chapter_asset's real_prompt only (per-card "Regenerate"), leaving
// every other asset on the chapter untouched. If this asset is "matched", the new
// prompt is a local override on this chapter_asset row — the bible entry is not touched.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseRoute();

  const { data: asset, error: aErr } = await db.from("chapter_assets").select("*").eq("id", id).single();
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 404 });

  const { data: chapter, error: cErr } = await db
    .from("chapters")
    .select("script, story_id")
    .eq("id", asset.chapter_id)
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) {
    return NextResponse.json({ error: "Script is empty — write something first." }, { status: 400 });
  }

  const { data: story, error: stErr } = await db
    .from("stories")
    .select("visual_style_id")
    .eq("id", chapter.story_id)
    .single();
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const style = await resolveVisualStyle(story?.visual_style_id);
  const styleContext = style?.description ?? null;

  const realPrompt = await regenerateAssetPrompt(scriptText, asset.kind, asset.name, asset.meta, styleContext);

  const { data, error } = await db
    .from("chapter_assets")
    .update({ real_prompt: realPrompt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapChapterAsset(data));
}
