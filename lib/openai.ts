import OpenAI from "openai";
import { ASSET_SCHEMA, extractAssetsSystemPrompt } from "./prompts/extract-assets";
import { REGENERATE_SCHEMA, REGENERATE_LOCATION_SCHEMA, regenerateAssetSystemPrompt } from "./prompts/regenerate-asset";
import { STORYBOARD_SCHEMA, storyboardSystemPrompt } from "./prompts/storyboard";
import type { Region } from "./constants/regions";

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
}

export type SpaceKind = "interior" | "exterior";
export type ExtractedAsset = { name: string; meta: string; realPrompt: string };
// Locations additionally carry spaceKind — it selects the reference-image
// preset (interior view + floor plan vs exterior view + site plan).
export type ExtractedLocation = ExtractedAsset & { spaceKind: SpaceKind };
export type ExtractedAssets = { characters: ExtractedAsset[]; locations: ExtractedLocation[]; props: ExtractedAsset[] };

export async function extractAssets(
  scriptText: string,
  styleContext?: string | null,
  region: Region = "english",
  // Names already on the chapter. Re-Sync matches extracted assets to existing
  // rows by name, so a run that re-words a name it produced last time inserts a
  // duplicate and flags the original stale. Feeding the names back keeps them
  // stable across runs — including merged location names.
  existingNames: string[] = []
): Promise<ExtractedAssets> {
  const systemPrompt = extractAssetsSystemPrompt(styleContext, region);
  // With no names the message stays the bare script, exactly as before this
  // parameter existed — a "Script:" header the names block doesn't need would
  // shift Re-analyze's extraction for nothing.
  const userMessage = existingNames.length
    ? `Assets already extracted from this script — whenever the same entity appears, return it under the EXACT same name:\n${existingNames
        .map((n) => `- ${n}`)
        .join("\n")}\n\nScript:\n${scriptText}`
    : scriptText;
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
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
  kind: "character" | "location" | "prop",
  name: string,
  meta: string,
  styleContext?: string | null,
  region: Region = "english"
): Promise<{ realPrompt: string; spaceKind: SpaceKind | null }> {
  const systemPrompt = regenerateAssetSystemPrompt(kind, styleContext, region);
  const isLocation = kind === "location";
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Script:\n${scriptText}\n\nRegenerate the realPrompt for ${kind} "${name}" (${meta}).`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "regenerated_asset",
        schema: isLocation ? REGENERATE_LOCATION_SCHEMA : REGENERATE_SCHEMA,
        strict: true,
      },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { realPrompt: string; spaceKind?: SpaceKind };
  return { realPrompt: parsed.realPrompt, spaceKind: isLocation ? parsed.spaceKind ?? null : null };
}

export type GeneratedShotAsset = { name: string; kind: "character" | "location" | "prop" };
export type GeneratedShot = {
  label: string;
  beat: string;
  durationS: number;
  aspect: string;
  camera: string;
  prompt: string;
  videoPrompt: string;
  assetsUsed: GeneratedShotAsset[];
  startState: string;
  endState: string;
};
export type GeneratedScene = { title: string; slug: string; shots: GeneratedShot[] };

export async function generateStoryboard(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null,
  aspectRatio?: string,
  region: Region = "english"
): Promise<GeneratedScene[]> {
  const systemPrompt = storyboardSystemPrompt(styleContext, aspectRatio, region);
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: systemPrompt },
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
