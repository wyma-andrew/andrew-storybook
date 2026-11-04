import type { supabaseRoute } from "@/lib/supabase/route";
import { loadStoryboardInputs } from "@/lib/storyboard-inputs";
import { buildAssetContext } from "@/lib/storyboard-assets";
import {
  EXTRACT_ASSETS_EFFORT,
  EXTRACT_ASSETS_MODEL,
  STORYBOARD_MODEL,
  STORY_REASONING_EFFORT,
  extractAssetsMessages,
  storyboardMessages,
} from "@/lib/openai";
import type OpenAI from "openai";
import type { PromptPart } from "@/lib/prompts/parts";
import type {
  ExtractedAssetsOutput,
  PromptLabContext,
  PromptLabModel,
  PromptLabPass,
  PromptLabPreview,
  PromptLabUsage,
} from "@/lib/prompt-lab";

type Db = Awaited<ReturnType<typeof supabaseRoute>>;
type LabError = { error: { message: string; status: number } };

// The chapter's assets as stored rows look, rebuilt from an extraction run.
function extractedAssetRows(output: ExtractedAssetsOutput) {
  return [
    ...output.characters.map((a) => ({ kind: "character", name: a.name, meta: a.meta, real_prompt: a.realPrompt, looks: a.looks, is_group: a.isGroup })),
    ...output.locations.map((a) => ({ kind: "location", name: a.name, meta: a.meta, real_prompt: a.realPrompt })),
    ...output.props.map((a) => ({ kind: "prop", name: a.name, meta: a.meta, real_prompt: a.realPrompt })),
  ];
}

// Production's own builders, on the chapter as production reads it — so a
// preview is the request the real Analyze / Generate button would send.
export async function loadPromptLabPreview(
  db: Db,
  chapterId: string,
  pass: PromptLabPass,
  assetRunId: string | null = null
): Promise<PromptLabPreview | LabError> {
  const loaded = await loadStoryboardInputs(db, chapterId);
  if (loaded.error) return { error: loaded.error };
  const i = loaded.inputs;
  const context: PromptLabContext = {
    region: i.region,
    visualStyleId: i.visualStyleId,
    styleContext: i.styleContext,
    aspectRatio: i.aspectRatio ?? null,
    motionStyleId: i.motionStyleId,
    format: i.format,
    assetCount: i.assets.length,
  };

  if (pass === "extract_assets") {
    const messages = extractAssetsMessages(i.scriptText, i.styleContext, i.region);
    return {
      pass,
      model: EXTRACT_ASSETS_MODEL as PromptLabModel,
      productionEffort: EXTRACT_ASSETS_EFFORT,
      systemParts: messages.systemParts,
      userParts: messages.userParts,
      context,
      assetRunId: null,
    };
  }

  let assetContext = i.assetContext;
  if (assetRunId) {
    const { data: assetRun, error } = await db
      .from("prompt_lab_runs")
      .select("pass, chapter_id, output")
      .eq("id", assetRunId)
      .single();
    if (error) return { error: { message: error.message, status: 404 } };
    if (assetRun.pass !== "extract_assets" || assetRun.chapter_id !== chapterId || !assetRun.output) {
      return { error: { message: "That run is not a successful asset extraction of this chapter.", status: 400 } };
    }
    const rows = extractedAssetRows(assetRun.output as ExtractedAssetsOutput);
    assetContext = buildAssetContext(rows);
    context.assetCount = rows.length;
  }

  const messages = storyboardMessages(i.scriptText, assetContext, i.styleContext, i.aspectRatio, i.region, i.motionStyleId, i.format);
  return {
    pass,
    model: STORYBOARD_MODEL as PromptLabModel,
    productionEffort: STORY_REASONING_EFFORT,
    systemParts: messages.systemParts,
    userParts: messages.userParts,
    context,
    assetRunId,
  };
}

export function cleanParts(input: unknown): PromptPart[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is PromptPart => !!p && typeof p === "object" && typeof (p as PromptPart).text === "string")
    .map((p) => ({ key: String(p.key ?? ""), label: String(p.label ?? ""), source: String(p.source ?? ""), text: p.text }));
}

export function labUsage(usage: OpenAI.CompletionUsage | null): PromptLabUsage | null {
  return (
    usage && {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
      totalTokens: usage.total_tokens,
    }
  );
}
