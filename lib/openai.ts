import OpenAI from "openai";
import { ASSET_SCHEMA, extractAssetsSystemPrompt } from "./prompts/extract-assets";
import { REGENERATE_SCHEMA, REGENERATE_LOCATION_SCHEMA, regenerateAssetSystemPrompt } from "./prompts/regenerate-asset";
import {
  STORYBOARD_SCHEMA,
  SCENE_SHOTS_SCHEMA,
  storyboardSystemPrompt,
  regenerateSceneSystemPrompt,
  type SceneRegenerationTarget,
} from "./prompts/storyboard";
import { VOICE_OVER_ASSIGNMENT_SCHEMA, voiceOverAssignmentSystemPrompt } from "./prompts/voice-over";
import type { Region } from "./constants/regions";
import type { VoiceOverAssignment, VoiceOverSource } from "./voice-over";
import { parseSiteMap, type SiteMap } from "./site-map";

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
  shotScale: string;
  prompt: string;
  videoPrompt: string;
  assetsUsed: GeneratedShotAsset[];
  startState: string;
  endState: string;
  motionMode: string;
};
export type GeneratedScene = { title: string; slug: string; lighting: string; shots: GeneratedShot[] };
// The pass returns the chapter's geography alongside its scenes: the model
// settles the site map first (it is the schema's leading property) and shoots
// against it. The map is stored on the chapter and read back by single-scene
// regeneration — see lib/site-map.ts.
export type GeneratedStoryboard = { siteMap: SiteMap | null; scenes: GeneratedScene[] };

export async function generateStoryboard(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null,
  aspectRatio?: string,
  region: Region = "english",
  motionStyleId?: string | null
): Promise<GeneratedStoryboard> {
  const systemPrompt = storyboardSystemPrompt(styleContext, aspectRatio, region, motionStyleId);
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
  const parsed = JSON.parse(raw) as { siteMap?: unknown; scenes?: GeneratedScene[] };
  return { siteMap: parseSiteMap(parsed.siteMap), scenes: parsed.scenes ?? [] };
}

// Narration mapping only needs each shot's length and beat, so this takes the
// narrow shape shared by a freshly generated storyboard and a stored one with a
// single scene re-shot — a per-scene regeneration remaps the whole chapter.
export type VoiceOverPassScene = { shots: { durationS: number; beat: string | null }[] };

export async function assignVoiceOvers(
  voiceOvers: VoiceOverSource[],
  scenes: VoiceOverPassScene[]
): Promise<VoiceOverAssignment[]> {
  const shots = scenes.flatMap((scene, sceneOffset) =>
    scene.shots.map((shot, shotOffset) => ({
      sceneIndex: sceneOffset + 1,
      shotIndex: shotOffset + 1,
      durationS: Math.min(Math.max(shot.durationS, 1), 10),
      beat: shot.beat,
    }))
  );
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: voiceOverAssignmentSystemPrompt },
      { role: "user", content: JSON.stringify({ voiceOvers, shots }) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "voice_over_assignments", schema: VOICE_OVER_ASSIGNMENT_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { assignments: VoiceOverAssignment[] }).assignments;
}

// Re-shoots one existing scene in place. The scene's title/slug and every other
// scene are left alone; only this scene's shot list is replaced.
export async function regenerateSceneShots(
  scriptText: string,
  assetContext: string,
  target: SceneRegenerationTarget,
  styleContext?: string | null,
  aspectRatio?: string,
  region: Region = "english",
  motionStyleId?: string | null
): Promise<GeneratedShot[]> {
  const systemPrompt = regenerateSceneSystemPrompt(target, styleContext, aspectRatio, region, motionStyleId);
  const res = await openai().chat.completions.create({
    model: "gpt-5.6-luna",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Known assets:\n${assetContext}\n\nScript:\n${scriptText}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "scene_shots", schema: SCENE_SHOTS_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { shots: GeneratedShot[] }).shots ?? [];
}
