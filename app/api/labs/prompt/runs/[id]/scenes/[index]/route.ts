import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { parseSceneShots, runSceneShotsPass, type GeneratedStoryboard } from "@/lib/openai";
import { cleanParts, labUsage, loadPromptLabPreview } from "@/lib/prompt-lab-inputs";
import { joinPromptParts, promptPart } from "@/lib/prompts/parts";
import { sceneScopePrompt } from "@/lib/prompts/storyboard";
import { isCoverageMode } from "@/lib/constants/coverage-modes";
import {
  isPromptLabEffort,
  isPromptLabModel,
  labSceneTarget,
  mapPromptLabRun,
  type PromptLabSceneRunBody,
  type PromptLabUsage,
} from "@/lib/prompt-lab";

export const maxDuration = 300;

// Re-shoots one scene of a storyboard run, like the storyboard page's scene
// regenerate, with that run's neighbouring scenes as the continuity seams. The
// result is saved as a new run holding the source storyboard with only this
// scene's shots replaced, so the two compare scene by scene.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const { id, index } = await params;
  const sceneIndex = Number(index);
  const body = (await req.json().catch(() => null)) as Partial<PromptLabSceneRunBody> | null;
  if (!isPromptLabModel(body?.model) || !isPromptLabEffort(body?.reasoningEffort) || !isCoverageMode(body?.coverageMode)) {
    return NextResponse.json({ error: "Unknown model, reasoning effort or coverage mode" }, { status: 400 });
  }
  const systemParts = cleanParts(body.systemParts);
  const userParts = cleanParts(body.userParts);
  const user = joinPromptParts(userParts);
  const sceneScope = typeof body.sceneScope === "string" ? body.sceneScope : "";
  if (!joinPromptParts(systemParts).trim() || !user.trim() || !sceneScope.trim()) {
    return NextResponse.json({ error: "System prompt, user message and scene scope are required" }, { status: 400 });
  }

  const db = await supabaseRoute();
  const { data: source, error: sourceErr } = await db.from("prompt_lab_runs").select("chapter_id, pass, output").eq("id", id).single();
  if (sourceErr) return NextResponse.json({ error: sourceErr.message }, { status: 404 });
  const sourceOutput = source.output as GeneratedStoryboard | null;
  if (source.pass !== "storyboard" || !sourceOutput?.scenes?.[sceneIndex - 1]) {
    return NextResponse.json({ error: "That run has no such storyboard scene." }, { status: 400 });
  }
  const chapterId = source.chapter_id as string;
  const assetRunId = body.assetRunId ?? null;
  const preview = await loadPromptLabPreview(db, chapterId, "storyboard", assetRunId);
  if ("error" in preview) return NextResponse.json({ error: preview.error.message }, { status: preview.error.status });

  const coverageMode = body.coverageMode;
  const defaultScope = sceneScopePrompt(labSceneTarget(sourceOutput, sceneIndex, coverageMode));
  const sentParts = [...systemParts, promptPart("sceneScope", "Single scene scope", "scene regenerate", sceneScope)];
  const system = joinPromptParts(sentParts);

  type SentEffort = Exclude<PromptLabSceneRunBody["reasoningEffort"], "default">;
  const reasoningEffort =
    body.reasoningEffort === "default" ? (preview.productionEffort as SentEffort | null) : body.reasoningEffort;
  let rawOutput: string | null = null;
  let output: GeneratedStoryboard | null = null;
  let usage: PromptLabUsage | null = null;
  let latencyMs: number | null = null;
  let runError: string | null = null;
  try {
    const result = await runSceneShotsPass({ system, user }, preview.context.format, {
      model: body.model,
      reasoningEffort: reasoningEffort ?? undefined,
    });
    rawOutput = result.raw;
    latencyMs = result.latencyMs;
    usage = labUsage(result.usage);
    const shots = parseSceneShots(result.raw);
    if (!shots.length) throw new Error("The model returned no shots for this scene.");
    output = {
      ...sourceOutput,
      scenes: sourceOutput.scenes.map((scene, i) => (i === sceneIndex - 1 ? { ...scene, shots } : scene)),
    };
  } catch (error) {
    runError = error instanceof Error ? error.message : "Run failed";
  }

  const { data, error } = await db
    .from("prompt_lab_runs")
    .insert({
      chapter_id: chapterId,
      pass: "storyboard",
      asset_run_id: assetRunId,
      version_id: body.versionId ?? null,
      label: body.label?.trim() || null,
      model: body.model,
      reasoning_effort: reasoningEffort ?? null,
      system_prompt: system,
      user_prompt: user,
      system_parts: sentParts,
      user_parts: userParts,
      system_prompt_edited: system !== joinPromptParts(preview.systemParts) + defaultScope,
      user_prompt_edited: user !== joinPromptParts(preview.userParts),
      context: { ...preview.context, sceneRegen: { sourceRunId: id, sceneIndex, coverageMode } },
      raw_output: rawOutput,
      output,
      error: runError,
      usage,
      latency_ms: latencyMs,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapPromptLabRun(data));
}
