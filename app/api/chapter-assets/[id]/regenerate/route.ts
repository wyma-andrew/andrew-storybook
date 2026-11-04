import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapChapterAsset } from "@/lib/api/map";
import { tiptapToText } from "@/lib/tiptap-text";
import { regenerateAssetPrompt } from "@/lib/openai";
import { isRegion, DEFAULT_REGION } from "@/lib/constants/regions";
import { resolveStyleContext } from "@/lib/constants/visual-styles";

// Regenerates one chapter_asset's real_prompt only (per-card "Regenerate"), leaving
// every other asset on the chapter untouched.
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
    .select("visual_style_id, region")
    .eq("id", chapter.story_id)
    .single();
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  const region = isRegion(story?.region) ? story.region : DEFAULT_REGION;
  const styleContext = resolveStyleContext(region, story?.visual_style_id);

  const { realPrompt, spaceKind, looks } = await regenerateAssetPrompt(
    scriptText,
    asset.kind,
    asset.name,
    asset.meta,
    styleContext,
    region,
    Boolean(asset.is_group)
  );

  const { data, error } = await db
    .from("chapter_assets")
    .update({
      real_prompt: realPrompt,
      // Locations only; a regenerate can move a location from a room to a
      // compound, and the reference preset has to follow the new text.
      ...(spaceKind ? { space_kind: spaceKind } : {}),
      ...(asset.kind === "character" ? { looks } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapChapterAsset(data));
}
