import type { supabaseRoute } from "@/lib/supabase/route";
import { buildAssetContext } from "@/lib/storyboard-assets";
import { tiptapToText } from "@/lib/tiptap-text";
import { isRegion, DEFAULT_REGION, type Region } from "@/lib/constants/regions";
import { resolveStyleContext } from "@/lib/constants/visual-styles";
import { resolveStoryFormat, type StoryFormat } from "@/lib/constants/story-formats";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;

export type StoryboardAssetRow = {
  kind: string;
  name: string;
  meta: string | null;
  real_prompt: string;
  looks?: unknown;
  is_group?: boolean;
};

export type StoryboardInputs = {
  script: unknown;
  scriptText: string;
  assets: StoryboardAssetRow[];
  assetContext: string;
  visualStyleId: string | null;
  styleContext: string | null;
  aspectRatio: string | undefined;
  region: Region;
  motionStyleId: string | null;
  format: StoryFormat;
};

// Everything the full-chapter storyboard pass is generated from. Shared by the
// real Generate route and Prompt Lab so a lab run reads the chapter the same way.
export async function loadStoryboardInputs(
  db: Db,
  chapterId: string
): Promise<{ inputs: StoryboardInputs; error?: never } | { inputs?: never; error: { message: string; status: number } }> {
  const { data: chapter, error: chErr } = await db
    .from("chapters")
    .select("id, story_id, script, aspect_ratio")
    .eq("id", chapterId)
    .single();
  if (chErr) return { error: { message: chErr.message, status: 404 } };

  const scriptText = tiptapToText(chapter.script);
  if (!scriptText.trim()) return { error: { message: "Script is empty — write something first.", status: 400 } };

  const [{ data: assets, error: aErr }, { data: story, error: stErr }] = await Promise.all([
    db.from("chapter_assets").select("kind, name, meta, real_prompt, looks, is_group").eq("chapter_id", chapterId),
    db.from("stories").select("visual_style_id, aspect_ratio, region, motion_style_id, format").eq("id", chapter.story_id).single(),
  ]);
  if (aErr) return { error: { message: aErr.message, status: 500 } };
  if (stErr) return { error: { message: stErr.message, status: 500 } };

  const region = isRegion(story?.region) ? story.region : DEFAULT_REGION;
  const visualStyleId = (story?.visual_style_id as string | null) ?? null;
  return {
    inputs: {
      script: chapter.script,
      scriptText,
      assets: assets ?? [],
      assetContext: buildAssetContext(assets ?? []),
      visualStyleId,
      styleContext: resolveStyleContext(region, visualStyleId),
      aspectRatio: chapter.aspect_ratio ?? story?.aspect_ratio,
      region,
      motionStyleId: (story?.motion_style_id as string | null) ?? null,
      format: resolveStoryFormat(story?.format),
    },
  };
}
