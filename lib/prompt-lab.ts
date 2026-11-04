import type { ExtractedAssets, GeneratedStoryboard } from "@/lib/openai";
import type { PromptPart } from "@/lib/prompts/parts";
import type { Region } from "@/lib/constants/regions";
import type { StoryFormat } from "@/lib/constants/story-formats";
import { MOTION_STYLES, isMotionMode, type MotionMode } from "./constants/motion-styles";
import { COVERAGE_MODE_LABELS, type CoverageMode } from "./constants/coverage-modes";
import type { SceneRegenerationTarget } from "./prompts/storyboard";
import { formatSiteMap } from "./site-map";

export const PROMPT_LAB_PASSES = [
  { value: "storyboard", label: "Storyboard Generate" },
  { value: "extract_assets", label: "Asset Extraction" },
] as const;
export type PromptLabPass = (typeof PROMPT_LAB_PASSES)[number]["value"];

export const PROMPT_LAB_MODELS = ["gpt-6-luna", "gpt-6-sol", "gpt-5.4-mini"] as const;
export type PromptLabModel = (typeof PROMPT_LAB_MODELS)[number];

// "default" sends whatever the production pass sends (STORY_REASONING_EFFORT).
export const PROMPT_LAB_EFFORTS = ["default", "low", "medium", "high"] as const;
export type PromptLabEffort = (typeof PROMPT_LAB_EFFORTS)[number];

export type PromptLabContext = {
  region: Region;
  visualStyleId: string | null;
  styleContext: string | null;
  aspectRatio: string | null;
  motionStyleId: string | null;
  format: StoryFormat;
  assetCount: number;
  // Set on a run that re-shot one scene of another storyboard run; its output
  // is that run's storyboard with only this scene's shots replaced.
  sceneRegen?: PromptLabSceneRegen;
};

export type PromptLabSceneRegen = { sourceRunId: string; sceneIndex: number; coverageMode: CoverageMode };

export type PromptLabPreview = {
  pass: PromptLabPass;
  model: PromptLabModel;
  productionEffort: string | null;
  systemParts: PromptPart[];
  userParts: PromptPart[];
  context: PromptLabContext;
  assetRunId: string | null;
};

export type ExtractedAssetsOutput = ExtractedAssets & { storyAnalysis: unknown };

export type PromptLabUsage = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number | null;
  totalTokens: number;
};

export type PromptLabRunSummary = {
  id: string;
  chapterId: string;
  pass: PromptLabPass;
  assetRunId: string | null;
  versionId: string | null;
  label: string | null;
  model: string;
  reasoningEffort: string | null;
  systemPromptEdited: boolean;
  userPromptEdited: boolean;
  error: string | null;
  usage: PromptLabUsage | null;
  latencyMs: number | null;
  outputSummary: string;
  sceneRegen: PromptLabSceneRegen | null;
  createdAt: string;
};

export type PromptLabRun = PromptLabRunSummary & {
  systemPrompt: string;
  userPrompt: string;
  systemParts: PromptPart[];
  userParts: PromptPart[];
  context: PromptLabContext;
  rawOutput: string | null;
  output: GeneratedStoryboard | ExtractedAssetsOutput | null;
};

export type PromptLabOverride = { key: string; label: string; text: string };

// Motion preset text edited in the lab, keyed by motion style id then mode.
export type PromptLabMotionOverrides = Partial<Record<string, Partial<Record<MotionMode, string>>>>;

export type PromptLabVersion = {
  id: string;
  pass: PromptLabPass;
  name: string;
  overrides: PromptLabOverride[];
  motionOverrides: PromptLabMotionOverrides;
  updatedAt: string;
};

export type PromptLabVersionBody = {
  pass: PromptLabPass;
  name: string;
  overrides: PromptLabOverride[];
  motionOverrides: PromptLabMotionOverrides;
};

export function mapPromptLabVersion(row: Record<string, unknown>): PromptLabVersion {
  return {
    id: row.id as string,
    pass: row.pass as PromptLabPass,
    name: row.name as string,
    overrides: (row.overrides as PromptLabOverride[]) ?? [],
    motionOverrides: cleanMotionOverrides(row.motion_overrides),
    updatedAt: row.updated_at as string,
  };
}

export function cleanMotionOverrides(input: unknown): PromptLabMotionOverrides {
  if (!input || typeof input !== "object") return {};
  const result: PromptLabMotionOverrides = {};
  for (const [styleId, modes] of Object.entries(input as Record<string, unknown>)) {
    if (!MOTION_STYLES.some((s) => s.id === styleId) || !modes || typeof modes !== "object") continue;
    const kept: Partial<Record<MotionMode, string>> = {};
    for (const [mode, text] of Object.entries(modes as Record<string, unknown>)) {
      if (isMotionMode(mode) && typeof text === "string") kept[mode] = text;
    }
    if (Object.keys(kept).length) result[styleId] = kept;
  }
  return result;
}

export function hasMotionOverrides(overrides: PromptLabMotionOverrides): boolean {
  return Object.values(overrides).some((modes) => modes && Object.keys(modes).length > 0);
}

export function cleanOverrides(input: unknown): PromptLabOverride[] {
  if (!Array.isArray(input)) return [];
  return (input as Partial<PromptLabOverride>[])
    .filter((o) => o && typeof o.key === "string" && typeof o.text === "string")
    .map((o) => ({ key: o.key!, label: typeof o.label === "string" ? o.label : o.key!, text: o.text! }));
}

// The blocks of `parts` whose text differs from the same-keyed block of the
// chapter's code-built prompt — what a saved version keeps.
export function promptOverrides(parts: PromptPart[], original: PromptPart[]): PromptLabOverride[] {
  const byKey = new Map(original.map((p) => [p.key, p.text]));
  return parts.filter((p) => byKey.has(p.key) && byKey.get(p.key) !== p.text).map(({ key, label, text }) => ({ key, label, text }));
}

// Swaps a version's blocks into a chapter's own prompt. A block the chapter's
// prompt does not have (an empty style block, a non-ASMR story) is skipped.
export function applyOverrides(parts: PromptPart[], overrides: PromptLabOverride[]) {
  const byKey = new Map(overrides.map((o) => [o.key, o.text]));
  return {
    parts: parts.map((p) => (byKey.has(p.key) ? { ...p, text: byKey.get(p.key)! } : p)),
    skipped: overrides.filter((o) => !parts.some((p) => p.key === o.key)),
  };
}

export type PromptLabRunBody = {
  chapterId: string;
  pass: PromptLabPass;
  assetRunId?: string | null;
  versionId?: string | null;
  label?: string;
  model: PromptLabModel;
  reasoningEffort: PromptLabEffort;
  systemParts: PromptPart[];
  userParts: PromptPart[];
};

export type PromptLabSceneRunBody = Omit<PromptLabRunBody, "chapterId" | "pass"> & {
  coverageMode: CoverageMode;
  sceneScope: string;
};

// The same continuity handshake the storyboard page's scene regenerate sends,
// read from a lab run's output instead of the stored scenes. `sceneIndex` is 1-based.
export function labSceneTarget(output: GeneratedStoryboard, sceneIndex: number, coverageMode: CoverageMode): SceneRegenerationTarget {
  const scene = output.scenes[sceneIndex - 1];
  return {
    index: sceneIndex,
    title: scene.title || null,
    slug: scene.slug || null,
    previousEndState: output.scenes[sceneIndex - 2]?.shots.at(-1)?.endState ?? null,
    nextStartState: output.scenes[sceneIndex]?.shots[0]?.startState ?? null,
    siteMap: output.siteMap ? formatSiteMap(output.siteMap) : null,
    lighting: scene.lighting || null,
    previousShotCount: scene.shots.length || null,
    coverageMode,
  };
}

export function sceneRegenLabel(regen: PromptLabSceneRegen) {
  return `Scene ${regen.sceneIndex} · ${COVERAGE_MODE_LABELS[regen.coverageMode]}`;
}

export function isPromptLabPass(value: unknown): value is PromptLabPass {
  return PROMPT_LAB_PASSES.some((p) => p.value === value);
}

export function isPromptLabModel(value: unknown): value is PromptLabModel {
  return PROMPT_LAB_MODELS.includes(value as PromptLabModel);
}

export function isPromptLabEffort(value: unknown): value is PromptLabEffort {
  return PROMPT_LAB_EFFORTS.includes(value as PromptLabEffort);
}

export function passLabel(pass: PromptLabPass) {
  return PROMPT_LAB_PASSES.find((p) => p.value === pass)!.label;
}

function summarize(pass: PromptLabPass, output: unknown): string {
  if (!output) return "no output";
  if (pass === "extract_assets") {
    const o = output as ExtractedAssetsOutput;
    return `${o.characters?.length ?? 0} characters / ${o.locations?.length ?? 0} locations / ${o.props?.length ?? 0} props`;
  }
  const scenes = (output as GeneratedStoryboard).scenes ?? [];
  return `${scenes.length} scenes / ${scenes.reduce((sum, scene) => sum + (scene.shots?.length ?? 0), 0)} shots`;
}

type RunRow = Record<string, unknown>;

export function mapPromptLabRunSummary(row: RunRow): PromptLabRunSummary {
  const pass = row.pass as PromptLabPass;
  return {
    id: row.id as string,
    chapterId: row.chapter_id as string,
    pass,
    assetRunId: (row.asset_run_id as string | null) ?? null,
    versionId: (row.version_id as string | null) ?? null,
    label: (row.label as string | null) ?? null,
    model: row.model as string,
    reasoningEffort: (row.reasoning_effort as string | null) ?? null,
    systemPromptEdited: Boolean(row.system_prompt_edited),
    userPromptEdited: Boolean(row.user_prompt_edited),
    error: (row.error as string | null) ?? null,
    usage: (row.usage as PromptLabUsage | null) ?? null,
    latencyMs: (row.latency_ms as number | null) ?? null,
    outputSummary: summarize(pass, row.output),
    sceneRegen: ((row.scene_regen ?? (row.context as PromptLabContext | null)?.sceneRegen) as PromptLabSceneRegen | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function storedParts(parts: unknown, joined: string, label: string): PromptPart[] {
  if (Array.isArray(parts) && parts.length) return parts as PromptPart[];
  return [{ key: "full", label, source: "saved before blocks", text: joined }];
}

export function mapPromptLabRun(row: RunRow): PromptLabRun {
  return {
    ...mapPromptLabRunSummary(row),
    systemPrompt: row.system_prompt as string,
    userPrompt: row.user_prompt as string,
    systemParts: storedParts(row.system_parts, row.system_prompt as string, "Full system prompt"),
    userParts: storedParts(row.user_parts, row.user_prompt as string, "Full user message"),
    context: row.context as PromptLabContext,
    rawOutput: (row.raw_output as string | null) ?? null,
    output: (row.output as PromptLabRun["output"]) ?? null,
  };
}
