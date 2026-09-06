import OpenAI from "openai";
import { ASSET_SCHEMA, extractAssetsSystemPrompt } from "./prompts/extract-assets";
import { REGENERATE_SCHEMA, regenerateAssetSystemPrompt } from "./prompts/regenerate-asset";
import { STORYBOARD_SCHEMA, storyboardSystemPrompt } from "./prompts/storyboard";

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
}

export type ExtractedAsset = { name: string; meta: string; realPrompt: string };
export type ExtractedAssets = { characters: ExtractedAsset[]; locations: ExtractedAsset[] };

export async function extractAssets(scriptText: string, styleContext?: string | null): Promise<ExtractedAssets> {
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: extractAssetsSystemPrompt(styleContext) },
      { role: "user", content: scriptText },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "extracted_assets", schema: ASSET_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as ExtractedAssets;
}

// Regenerates a single already-extracted asset's realPrompt (per-card "Regenerate"
// button) — same rules as extractAssets, scoped to one named character/location.
export async function regenerateAssetPrompt(
  scriptText: string,
  kind: "character" | "location",
  name: string,
  meta: string,
  styleContext?: string | null
): Promise<string> {
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: regenerateAssetSystemPrompt(kind, styleContext) },
      {
        role: "user",
        content: `Script:\n${scriptText}\n\nRegenerate the realPrompt for ${kind} "${name}" (${meta}).`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "regenerated_asset", schema: REGENERATE_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { realPrompt: string }).realPrompt;
}

export type GeneratedShotAsset = { name: string; kind: "character" | "location" };
export type GeneratedShot = {
  label: string;
  durationS: number;
  aspect: string;
  camera: string;
  prompt: string;
  frameMode: "start_frame_only" | "start_and_end_frame";
  endFramePrompt: string | null;
  videoPrompt: string;
  assetsUsed: GeneratedShotAsset[];
};
export type GeneratedScene = { title: string; slug: string; shots: GeneratedShot[] };

export async function generateStoryboard(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null,
  aspectRatio?: string
): Promise<GeneratedScene[]> {
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: storyboardSystemPrompt(styleContext, aspectRatio) },
      { role: "user", content: `Known assets:\n${assetContext}\n\nScript:\n${scriptText}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "storyboard", schema: STORYBOARD_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { scenes: GeneratedScene[] }).scenes;
}
