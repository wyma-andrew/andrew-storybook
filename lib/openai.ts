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
import type { MovieRecapPacing } from "./constants/movie-recap";
import {
  MOVIE_RECAP_NARRATION_SCHEMA,
  MOVIE_RECAP_SCENE_VISION_SCHEMA,
  movieRecapNarrationSystemPrompt,
  movieRecapSceneVisionSystemPrompt,
} from "./prompts/movie-recap-narration";
import {
  MOVIE_RECAP_HOOK_TITLE_COUNT,
  MOVIE_RECAP_HOOK_TITLE_SCHEMA,
  movieRecapHookTitleSystemPrompt,
} from "./prompts/movie-recap-hook-title";
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

// Movie Recap render pipeline — see lib/movie-recap-render.ts. The source is
// read twice: once through its audio (Whisper) and once through its pictures
// (one keyframe per detected scene), because an action beat with no dialogue is
// invisible to a transcript.
export type TranscriptSegment = { start: number; end: number; text: string };

export type RecapScene = {
  index: number;
  startS: number;
  endS: number;
  visual: string;
  dialogue: string;
};

// Keyframes are sent at `detail: "low"` — roughly 19 prompt tokens per image,
// so describing a few hundred scenes costs about as much as one page of text.
export async function describeMovieRecapScenes(
  scenes: { index: number; frames: string[] }[],
  signal?: AbortSignal
): Promise<{ sceneIndex: number; visual: string; peakFrame: number }[]> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  for (const scene of scenes) {
    // The frame count is stated because `peakFrame` is an index into it — the
    // model has to know how many it is choosing between.
    content.push({
      type: "text",
      text:
        scene.frames.length > 1
          ? `Scene ${scene.index} — ${scene.frames.length} frames in order:`
          : `Scene ${scene.index}:`,
    });
    for (const frame of scene.frames) {
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}`, detail: "low" } });
    }
  }
  const res = await openai().chat.completions.create(
    {
      model: "gpt-5.6-luna",
      messages: [
        { role: "system", content: movieRecapSceneVisionSystemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "movie_recap_scene_vision", schema: MOVIE_RECAP_SCENE_VISION_SCHEMA, strict: true },
      },
    },
    { signal }
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { scenes: { sceneIndex: number; visual: string; peakFrame: number }[] }).scenes ?? [];
}

// Returns one narration line per BEAT, each naming the scenes it plays over —
// the model picks which scenes carry the plot and how they group, rather than
// inventing timestamps, so every recap cut lands on a real one.
// Hook titles for a finished recap, written from the narration the render just
// produced. Several options, because the user picks one — see
// history/movie-recap.md.
//
// Length and count are clamped here rather than trusted from the model: a
// strict JSON schema can guarantee an array of strings, but not how many or how
// long, and the UI has fixed room for them.
export async function generateMovieRecapHookTitles(
  narration: { text: string }[],
  signal?: AbortSignal
): Promise<string[]> {
  const lines = narration.map((segment) => segment.text).filter(Boolean);
  if (!lines.length) return [];
  const res = await openai().chat.completions.create(
    {
      model: "gpt-5.6-luna",
      messages: [
        { role: "system", content: movieRecapHookTitleSystemPrompt },
        { role: "user", content: JSON.stringify({ narration: lines }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "movie_recap_hook_titles", schema: MOVIE_RECAP_HOOK_TITLE_SCHEMA, strict: true },
      },
    },
    { signal }
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  const titles = (JSON.parse(raw) as { titles?: unknown }).titles;
  if (!Array.isArray(titles)) return [];
  return titles
    .filter((title): title is string => typeof title === "string")
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, MOVIE_RECAP_HOOK_TITLE_COUNT);
}

export async function generateMovieRecapNarration(
  scenes: RecapScene[],
  pacing: MovieRecapPacing,
  signal?: AbortSignal
): Promise<{ sceneIndexes: number[]; text: string }[]> {
  const res = await openai().chat.completions.create(
    {
      model: "gpt-5.6-luna",
      messages: [
        { role: "system", content: movieRecapNarrationSystemPrompt(pacing) },
        { role: "user", content: JSON.stringify({ scenes }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "movie_recap_narration", schema: MOVIE_RECAP_NARRATION_SCHEMA, strict: true },
      },
    },
    { signal }
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { segments: { sceneIndexes: number[]; text: string }[] }).segments ?? [];
}
