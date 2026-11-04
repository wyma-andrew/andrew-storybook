import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/api/auth-guard";
import { parseExtractedAssets, parseStoryboard, runExtractAssetsPass, runStoryboardPass } from "@/lib/openai";
import { cleanParts, labUsage, loadPromptLabPreview } from "@/lib/prompt-lab-inputs";
import { joinPromptParts } from "@/lib/prompts/parts";
import {
  isPromptLabEffort,
  isPromptLabModel,
  isPromptLabPass,
  mapPromptLabRun,
  type PromptLabRunBody,
  type PromptLabUsage,
} from "@/lib/prompt-lab";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;
  const body = (await req.json().catch(() => null)) as Partial<PromptLabRunBody> | null;
  const systemParts = cleanParts(body?.systemParts);
  const userParts = cleanParts(body?.userParts);
  const system = joinPromptParts(systemParts);
  const user = joinPromptParts(userParts);
  if (!body?.chapterId || !system.trim() || !user.trim()) {
    return NextResponse.json({ error: "chapterId, system and user prompts are required" }, { status: 400 });
  }
  if (!isPromptLabPass(body.pass) || !isPromptLabModel(body.model) || !isPromptLabEffort(body.reasoningEffort)) {
    return NextResponse.json({ error: "Unknown pass, model or reasoning effort" }, { status: 400 });
  }
  const pass = body.pass;
  const assetRunId = pass === "storyboard" ? body.assetRunId ?? null : null;

  const db = await supabaseRoute();
  const preview = await loadPromptLabPreview(db, body.chapterId, pass, assetRunId);
  if ("error" in preview) return NextResponse.json({ error: preview.error.message }, { status: preview.error.status });

  type SentEffort = Exclude<PromptLabRunBody["reasoningEffort"], "default">;
  const reasoningEffort =
    body.reasoningEffort === "default" ? (preview.productionEffort as SentEffort | null) : body.reasoningEffort;
  const options = { model: body.model, reasoningEffort: reasoningEffort ?? undefined };
  const messages = { system, user };
  let rawOutput: string | null = null;
  let output: unknown = null;
  let usage: PromptLabUsage | null = null;
  let latencyMs: number | null = null;
  let runError: string | null = null;
  try {
    const result =
      pass === "extract_assets"
        ? await runExtractAssetsPass(messages, options)
        : await runStoryboardPass(messages, preview.context.format, options);
    rawOutput = result.raw;
    latencyMs = result.latencyMs;
    usage = labUsage(result.usage);
    output = pass === "extract_assets" ? parseExtractedAssets(result.raw) : parseStoryboard(result.raw);
  } catch (error) {
    runError = error instanceof Error ? error.message : "Run failed";
  }

  const { data, error } = await db
    .from("prompt_lab_runs")
    .insert({
      chapter_id: body.chapterId,
      pass,
      asset_run_id: assetRunId,
      version_id: body.versionId ?? null,
      label: body.label?.trim() || null,
      model: body.model,
      reasoning_effort: reasoningEffort ?? null,
      system_prompt: system,
      user_prompt: user,
      system_parts: systemParts,
      user_parts: userParts,
      system_prompt_edited: system !== joinPromptParts(preview.systemParts),
      user_prompt_edited: user !== joinPromptParts(preview.userParts),
      context: preview.context,
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
