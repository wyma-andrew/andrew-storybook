import OpenAI from "openai";
import { ASSET_SCHEMA, extractAssetsSystemPromptParts } from "./prompts/extract-assets";
import {
  REGENERATE_SCHEMA,
  REGENERATE_LOCATION_SCHEMA,
  REGENERATE_CHARACTER_SCHEMA,
  regenerateAssetSystemPrompt,
} from "./prompts/regenerate-asset";
import { parseLooks, type CharacterLook } from "./character-looks";
import {
  storyboardSchema,
  sceneShotsSchema,
  storyboardSystemPromptParts,
  regenerateSceneSystemPrompt,
  type SceneRegenerationTarget,
} from "./prompts/storyboard";
import { VOICE_OVER_ASSIGNMENT_SCHEMA, voiceOverAssignmentSystemPrompt } from "./prompts/voice-over";
import { movieRecapStorySystemPrompt } from "./prompts/movie-recap-translation";
import {
  MOVIE_RECAP_NARRATION_SCHEMA,
  MOVIE_RECAP_SCENE_VISION_SCHEMA,
  movieRecapNarrationSystemPrompt,
  movieRecapSceneVisionSystemPrompt,
} from "./prompts/movie-recap-narration";
import {
  MOVIE_RECAP_TRANSCRIPT_VISION_SCHEMA,
  movieRecapTranscriptVisionSystemPrompt,
} from "./prompts/movie-recap-transcript-vision";
import {
  MOVIE_RECAP_SCENE_SPLIT_SCHEMA,
  movieRecapSceneSplitSystemPrompt,
} from "./prompts/movie-recap-scene-split";
import type { Region } from "./constants/regions";
import type { StoryFormat } from "./constants/story-formats";
import type { VoiceOverAssignment, VoiceOverSource } from "./voice-over";
import { parseSiteMap, type SiteMap } from "./site-map";
import { joinPromptParts, nonEmptyParts, promptPart, type PromptPart } from "./prompts/parts";

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
}

export type SpaceKind = "interior" | "exterior";
export type ExtractedAsset = { name: string; meta: string; scenes: string[]; evidence: string; realPrompt: string };
// Locations additionally carry spaceKind — it selects the reference-image
// preset (interior view + floor plan vs exterior view + site plan).
export type ExtractedLocation = ExtractedAsset & { spaceKind: SpaceKind };
export type ExtractedCharacter = ExtractedAsset & { looks: CharacterLook[]; isGroup: boolean };
export type ExtractedAssets = { characters: ExtractedCharacter[]; locations: ExtractedLocation[]; props: ExtractedAsset[] };

// Every Story pass (extraction, asset regenerate, storyboard, scene regenerate,
// Voice Over mapping) runs at one effort — history/asset-extraction.md,
// 2026-10-29.
export const STORY_REASONING_EFFORT = "medium" as const;

export const EXTRACT_ASSETS_MODEL = "gpt-6-luna";
export const EXTRACT_ASSETS_EFFORT = STORY_REASONING_EFFORT;

export function extractAssetsMessages(
  scriptText: string,
  styleContext?: string | null,
  region: Region = "english",
  // Names already on the chapter. Re-Sync matches extracted assets to existing
  // rows by name, so a run that re-words a name it produced last time inserts a
  // duplicate and flags the original stale. Feeding the names back keeps them
  // stable across runs — including merged location names.
  existingNames: string[] = []
): PassMessageParts {
  // With no names the message stays the bare script, exactly as before this
  // parameter existed — a "Script:" header the names block doesn't need would
  // shift Re-analyze's extraction for nothing.
  const userParts = existingNames.length
    ? [
        promptPart(
          "existingNames",
          "Existing asset names",
          "Re-Sync",
          `Assets already extracted from this script — whenever the same entity appears, return it under the EXACT same name:\n${existingNames
            .map((n) => `- ${n}`)
            .join("\n")}\n\n`
        ),
        promptPart("script", "Script", "chapter", `Script:\n${scriptText}`),
      ]
    : [promptPart("script", "Script", "chapter", scriptText)];
  return withJoined(extractAssetsSystemPromptParts(styleContext, region), userParts);
}

export async function runExtractAssetsPass(
  messages: PassMessages,
  { model = EXTRACT_ASSETS_MODEL, reasoningEffort = EXTRACT_ASSETS_EFFORT }: PassOptions = {}
) {
  const started = Date.now();
  const res = await openai().chat.completions.create({
    model,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "extracted_assets", schema: ASSET_SCHEMA, strict: true },
    },
  });
  return {
    raw: res.choices[0]?.message?.content ?? "{}",
    usage: res.usage ?? null,
    latencyMs: Date.now() - started,
  };
}

export function parseExtractedAssets(raw: string): ExtractedAssets & { storyAnalysis: unknown } {
  const { storyAnalysis, ...assets } = JSON.parse(raw) as ExtractedAssets & { storyAnalysis?: unknown };
  return {
    ...assets,
    characters: assets.characters.map((c) => ({ ...c, looks: parseLooks(c.isGroup ? [] : c.looks), isGroup: Boolean(c.isGroup) })),
    storyAnalysis: storyAnalysis ?? null,
  };
}

export async function extractAssets(
  scriptText: string,
  styleContext?: string | null,
  region: Region = "english",
  existingNames: string[] = []
): Promise<ExtractedAssets> {
  const { raw } = await runExtractAssetsPass(extractAssetsMessages(scriptText, styleContext, region, existingNames));
  const { storyAnalysis, ...assets } = parseExtractedAssets(raw);
  console.info("[extractAssets] storyAnalysis", JSON.stringify(storyAnalysis));
  return assets;
}

// Regenerates a single already-extracted asset's realPrompt (per-card "Regenerate"
// button) — same rules as extractAssets, scoped to one named character/location.
export async function regenerateAssetPrompt(
  scriptText: string,
  kind: "character" | "location" | "prop",
  name: string,
  meta: string,
  styleContext?: string | null,
  region: Region = "english",
  isGroup = false
): Promise<{ realPrompt: string; spaceKind: SpaceKind | null; looks: CharacterLook[] }> {
  const systemPrompt = regenerateAssetSystemPrompt(kind, styleContext, region);
  const isLocation = kind === "location";
  const isCharacter = kind === "character";
  const res = await openai().chat.completions.create({
    model: "gpt-6-luna",
    reasoning_effort: STORY_REASONING_EFFORT,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Script:\n${scriptText}\n\nRegenerate the realPrompt for ${kind} "${name}" (${meta}).${isGroup ? " This is a CHARACTER GROUP: describe what its members share, not one individual." : ""}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "regenerated_asset",
        schema: isLocation ? REGENERATE_LOCATION_SCHEMA : isCharacter ? REGENERATE_CHARACTER_SCHEMA : REGENERATE_SCHEMA,
        strict: true,
      },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { realPrompt: string; spaceKind?: SpaceKind; looks?: unknown };
  return {
    realPrompt: parsed.realPrompt,
    spaceKind: isLocation ? parsed.spaceKind ?? null : null,
    looks: isCharacter && !isGroup ? parseLooks(parsed.looks) : [],
  };
}

export type GeneratedShotAsset = { name: string; kind: "character" | "location" | "prop"; look: string; station: string };
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
  // Only present when the story's format generates sound (cozy-asmr).
  soundPrompt?: string;
};
export type GeneratedScene = { title: string; slug: string; lighting: string; shots: GeneratedShot[] };
// The pass returns the chapter's geography alongside its scenes: the model
// settles the site map first (it is the schema's leading property) and shoots
// against it. The map is stored on the chapter and read back by single-scene
// regeneration — see lib/site-map.ts.
export type GeneratedStoryboard = { siteMap: SiteMap | null; scenes: GeneratedScene[] };

export const STORYBOARD_MODEL = "gpt-6-luna";

export type PassMessages = { system: string; user: string };
export type PassMessageParts = PassMessages & { systemParts: PromptPart[]; userParts: PromptPart[] };

function withJoined(systemParts: PromptPart[], userParts: PromptPart[]): PassMessageParts {
  const user = nonEmptyParts(userParts);
  return { system: joinPromptParts(systemParts), user: joinPromptParts(user), systemParts, userParts: user };
}
export type PassOptions = { model?: string; reasoningEffort?: OpenAI.ReasoningEffort };

// Prompt Lab builds its default messages here too, so what it shows is exactly
// what production sends.
export function storyboardMessages(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null,
  aspectRatio?: string,
  region: Region = "english",
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
): PassMessageParts {
  return withJoined(storyboardSystemPromptParts(styleContext, aspectRatio, region, motionStyleId, format), [
    promptPart("knownAssets", "Known assets", "chapter assets", `Known assets:\n${assetContext}\n\n`),
    promptPart("script", "Script", "chapter", `Script:\n${scriptText}`),
  ]);
}

export async function runStoryboardPass(
  messages: PassMessages,
  format: StoryFormat,
  { model = STORYBOARD_MODEL, reasoningEffort = STORY_REASONING_EFFORT }: PassOptions = {}
) {
  const started = Date.now();
  const res = await openai().chat.completions.create({
    model,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "storyboard", schema: storyboardSchema(format), strict: true },
    },
  });
  return {
    raw: res.choices[0]?.message?.content ?? "{}",
    usage: res.usage ?? null,
    latencyMs: Date.now() - started,
  };
}

export function parseStoryboard(raw: string): GeneratedStoryboard {
  const parsed = JSON.parse(raw) as { siteMap?: unknown; scenes?: GeneratedScene[] };
  return { siteMap: parseSiteMap(parsed.siteMap), scenes: parsed.scenes ?? [] };
}

export async function generateStoryboard(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null,
  aspectRatio?: string,
  region: Region = "english",
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
): Promise<GeneratedStoryboard> {
  const messages = storyboardMessages(scriptText, assetContext, styleContext, aspectRatio, region, motionStyleId, format);
  const { raw } = await runStoryboardPass(messages, format);
  return parseStoryboard(raw);
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
    model: "gpt-6-luna",
    reasoning_effort: STORY_REASONING_EFFORT,
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
  motionStyleId?: string | null,
  format: StoryFormat = "cinematic"
): Promise<GeneratedShot[]> {
  const system = regenerateSceneSystemPrompt(target, styleContext, aspectRatio, region, motionStyleId, format);
  const { raw } = await runSceneShotsPass({ system, user: `Known assets:\n${assetContext}\n\nScript:\n${scriptText}` }, format);
  return parseSceneShots(raw);
}

export async function runSceneShotsPass(
  messages: PassMessages,
  format: StoryFormat,
  { model = STORYBOARD_MODEL, reasoningEffort = STORY_REASONING_EFFORT }: PassOptions = {}
) {
  const started = Date.now();
  const res = await openai().chat.completions.create({
    model,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "scene_shots", schema: sceneShotsSchema(format), strict: true },
    },
  });
  return {
    raw: res.choices[0]?.message?.content ?? "{}",
    usage: res.usage ?? null,
    latencyMs: Date.now() - started,
  };
}

export function parseSceneShots(raw: string): GeneratedShot[] {
  return (JSON.parse(raw) as { shots?: GeneratedShot[] }).shots ?? [];
}

// Movie Recap render pipeline — see lib/movie-recap-render.ts. The source is
// read twice: once through its audio (Whisper) and once through its pictures
// (one keyframe per detected scene), because an action beat with no dialogue is
// invisible to a transcript.
// The two passes a Movie Recap render actually spends on, as env-overridable
// names.
//
// Default `gpt-5.4-mini` rather than the Luna model the rest of this file uses:
// it is on OpenAI's shared-traffic free tier (2.5M tokens a day across the mini
// and nano models), and a whole render is about 16k — so a day's allowance is
// ~150 renders. Neither pass is a writing pass, which is why a small model is
// enough: one describes a frame, the other only chooses where the user's own
// text breaks, and the split is verified character-for-character before it is
// used (lib/movie-recap-scene-text.ts).
//
// Both must support VISION and STRICT JSON SCHEMA, and both are sent
// `reasoning_effort`. Swapping in a model without one of those — gpt-4.1-mini
// and 4o-mini see images but reject `reasoning_effort`; o3-mini and o4-mini take
// it but are text-only — fails the call, not the render: the split falls back to
// the mechanical one and a vision failure leaves the descriptions empty.
const MOVIE_RECAP_VISION_MODEL = process.env.MOVIE_RECAP_VISION_MODEL || "gpt-5.4-mini";
const MOVIE_RECAP_SPLIT_MODEL = process.env.MOVIE_RECAP_SPLIT_MODEL || "gpt-5.4-mini";

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
      model: MOVIE_RECAP_VISION_MODEL,
      // Describing what is in a frame is recall, not reasoning, and this runs
      // once per eight scenes across the whole film — the cheapest setting is
      // also the one that keeps a long source from spending minutes here.
      reasoning_effort: "low",
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

export type TranscriptCastMember = { label: string; look: string };

/**
 * The Transcript step's scene pass. Unlike `describeMovieRecapScenes`, it sees
 * the dialogue under each scene, may return an empty description for a scene
 * that adds nothing, and carries a cast list between batches so a recurring
 * person keeps one label for the whole film.
 */
export async function describeMovieRecapTranscriptScenes(
  input: {
    cast: TranscriptCastMember[];
    previousVisual: string;
    scenes: { index: number; startS: number; endS: number; dialogue: string; frames: string[] }[];
  },
  signal?: AbortSignal
): Promise<{ scenes: { sceneIndex: number; visual: string }[]; cast: TranscriptCastMember[] }> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        `Cast so far: ${input.cast.length ? input.cast.map((member) => `${member.label} — ${member.look}`).join("; ") : "none"}.\n` +
        `Previous scene: ${input.previousVisual || "none"}`,
    },
  ];
  for (const scene of input.scenes) {
    content.push({
      type: "text",
      text:
        `Scene ${scene.index} (${scene.startS.toFixed(1)}s-${scene.endS.toFixed(1)}s), ${scene.frames.length} frames in order. ` +
        `Dialogue: ${scene.dialogue || "none"}`,
    });
    for (const frame of scene.frames) {
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}`, detail: "low" } });
    }
  }
  const res = await openai().chat.completions.create(
    {
      model: MOVIE_RECAP_VISION_MODEL,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: movieRecapTranscriptVisionSystemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "movie_recap_transcript_vision", schema: MOVIE_RECAP_TRANSCRIPT_VISION_SCHEMA, strict: true },
      },
    },
    { signal }
  );
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
    scenes?: { sceneIndex: number; visual: string }[];
    cast?: TranscriptCastMember[];
  };
  return { scenes: parsed.scenes ?? [], cast: parsed.cast?.length ? parsed.cast : input.cast };
}

/**
 * Divide ONE passage of the user's own Burmese across the scenes it plays over.
 *
 * Nothing here writes narration: the passage is the user's, and this pass only
 * decides where it breaks. The result is positional — one entry per scene given,
 * in the same order — so a model that loses count is caught by the caller rather
 * than silently re-ordering the story.
 */
export async function splitMovieRecapBeat(
  scenes: { index: number; seconds: number; visual: string }[],
  text: string,
  signal?: AbortSignal
): Promise<{ sceneIndex: number; text: string }[]> {
  const res = await openai().chat.completions.create(
    {
      model: MOVIE_RECAP_SPLIT_MODEL,
      // NOT low. Matching a sentence to the picture it describes is the entire
      // reason this pass exists — at low effort it falls back to splitting by
      // length, which is what the mechanical fallback already does for free.
      reasoning_effort: "medium",
      messages: [
        { role: "system", content: movieRecapSceneSplitSystemPrompt },
        { role: "user", content: JSON.stringify({ scenes, passage: text }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "movie_recap_scene_split", schema: MOVIE_RECAP_SCENE_SPLIT_SCHEMA, strict: true },
      },
    },
    { signal }
  );
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { parts: { sceneIndex: number; text: string }[] }).parts ?? [];
}

// Returns one narration line per BEAT, each naming the scenes it plays over —
// the model picks which scenes carry the plot and how they group, rather than
// inventing timestamps, so every recap cut lands on a real one.
export async function generateMovieRecapNarration(
  scenes: RecapScene[],
  signal?: AbortSignal
): Promise<{ sceneIndexes: number[]; text: string }[]> {
  const res = await openai().chat.completions.create(
    {
      model: "gpt-6-luna",
      messages: [
        { role: "system", content: movieRecapNarrationSystemPrompt },
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

// The retelling runs on Sol rather than the Luna model every other pass uses:
// this is the one pass whose output a person reads as prose, so it is judged on
// how the Burmese sounds, not on filling a schema.
const STORY_MODEL = "gpt-6-sol";

// One passage of the source's dialogue, retold in Burmese as a story rather
// than translated line by line. Chunking is the caller's job
// (lib/movie-recap-transcript.ts).
export async function retellInBurmese(
  text: string,
  signal?: AbortSignal,
  // Called with the characters written so far. Streamed for the progress bar,
  // not for display: one passage takes minutes, and a bar that only moves when a
  // whole passage lands sits at 0% for all of it.
  onProgress?: (charactersSoFar: number) => void
): Promise<string> {
  if (!text.trim()) return "";
  const stream = await openai().chat.completions.create(
    {
      model: STORY_MODEL,
      messages: [
        { role: "system", content: movieRecapStorySystemPrompt },
        { role: "user", content: text },
      ],
      stream: true,
    },
    { signal }
  );
  let out = "";
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (!delta) continue;
    out += delta;
    onProgress?.(out.length);
  }
  return out.trim();
}

// One batch of synced SRT blocks translated to Burmese SRT. Same model as the recap
// retelling: the output is read as dialogue, so the Burmese quality decides it.
export async function translateSrtBatch(prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await openai().chat.completions.create(
    { model: STORY_MODEL, messages: [{ role: "user", content: prompt }] },
    { signal }
  );
  return res.choices[0]?.message?.content ?? "";
}
