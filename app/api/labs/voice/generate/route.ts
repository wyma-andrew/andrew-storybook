import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { supabaseRoute } from "@/lib/supabase/route";
import { mapConcurrent } from "@/lib/map-concurrent";
import { deleteObject, presignPut, putObject } from "@/lib/r2";
import { synthesize, TtsError } from "@/lib/tts/synthesize";
import type { Voice } from "@/lib/tts/types";
import { voiceWorkerHeaders, voiceWorkerUrl } from "@/lib/voice-worker";
import { getVoiceById } from "@/lib/tts/voices";
import { mapVoiceLabItem, VOICE_LAB_STALE_PROCESSING_MS } from "@/lib/voice-lab";

export const runtime = "nodejs";
export const maxDuration = 300;

const AZURE_CONCURRENCY = 3;
// Modal cold starts can exceed a minute; leave one minute inside maxDuration.
const WORKER_DISPATCH_TIMEOUT_MS = 4 * 60 * 1000;

class WorkerDispatchTimeout extends Error {}

type Db = Awaited<ReturnType<typeof supabaseRoute>>;
type Row = { id: string; text: string; audio_key: string | null };

async function markFailed(db: Db, ids: string[], message: string) {
  await db.from("voice_lab_items").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).in("id", ids);
}

async function runAzure(db: Db, voice: Voice, ownerId: string, rows: Row[]) {
  await mapConcurrent(rows, AZURE_CONCURRENCY, async (row) => {
    try {
      const result = await synthesize({ text: row.text, voice });
      const key = `voice-lab/${ownerId}/${row.id}-${randomUUID()}.wav`;
      const url = await putObject(key, result.audio, "audio/wav");
      if (row.audio_key) await deleteObject(row.audio_key).catch(() => undefined);
      await db
        .from("voice_lab_items")
        .update({
          status: "done",
          audio_key: key,
          audio_url: url,
          duration_seconds: result.durationSeconds,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (error) {
      await markFailed(db, [row.id], error instanceof TtsError ? error.message : "Voice generation failed.");
    }
  });
}

async function dispatchToWorker(db: Db, voice: Extract<Voice, { providerId: "voxcpm" }>, ownerId: string, rows: Row[], origin: string) {
  const url = voiceWorkerUrl("jobs");
  if (!url) throw new TtsError("Voice worker is not configured. Set VOICE_LAB_WORKER_URL first.", 503);
  const callbackBase = (process.env.VOICE_CALLBACK_BASE_URL?.trim() || origin).replace(/\/+$/, "");

  const items = await Promise.all(
    rows.map(async (row) => {
      const key = `voice-lab/${ownerId}/${row.id}-${randomUUID()}.wav`;
      const { error } = await db.from("voice_lab_items").update({ audio_key: key }).eq("id", row.id);
      if (error) throw new TtsError(error.message, 500);
      return { id: row.id, text: row.text, uploadUrl: await presignPut(key, "audio/wav") };
    }),
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: voiceWorkerHeaders(),
      body: JSON.stringify({
        jobId: randomUUID(),
        items,
        stylePrompt: voice.params.stylePrompt,
        seed: voice.params.seed,
        referenceAudioId: voice.params.referenceAudioId,
        referenceText: voice.params.referenceText,
        callbackUrl: `${callbackBase}/api/labs/voice/callback`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(WORKER_DISPATCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new WorkerDispatchTimeout();
    throw new TtsError("Could not reach the voice worker.", 502);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new TtsError(typeof detail?.detail === "string" ? detail.detail : `Voice worker returned ${response.status}.`, 502);
  }
}

export async function POST(request: NextRequest) {
  const { user, unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const voice = getVoiceById(body?.voiceId);
  if (!voice) return NextResponse.json({ error: "Choose a supported voice profile." }, { status: 400 });
  if (typeof body?.projectId !== "string") return NextResponse.json({ error: "Choose a project." }, { status: 400 });
  const itemIds: string[] | null = Array.isArray(body?.itemIds) ? body.itemIds.filter((id: unknown) => typeof id === "string") : null;

  const db = await supabaseRoute();
  const staleBefore = new Date(Date.now() - VOICE_LAB_STALE_PROCESSING_MS).toISOString();
  let query = db.from("voice_lab_items").select("id, text, audio_key").eq("project_id", body.projectId).order("position");
  query = itemIds
    ? query.in("id", itemIds)
    : query.or(`status.in.(pending,failed),and(status.eq.processing,updated_at.lt.${staleBefore})`);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows.length) return NextResponse.json({ error: "Nothing to generate." }, { status: 400 });

  const ids = rows.map((row) => row.id);
  const { error: markError } = await db
    .from("voice_lab_items")
    .update({ status: "processing", voice_id: voice.id, audio_url: null, duration_seconds: null, error: null, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (markError) return NextResponse.json({ error: markError.message }, { status: 500 });

  try {
    if (voice.providerId === "voxcpm") {
      const stale = rows.filter((row) => row.audio_key).map((row) => row.audio_key as string);
      await dispatchToWorker(db, voice, user!.id, rows, request.nextUrl.origin);
      await Promise.allSettled(stale.map((key) => deleteObject(key)));
    } else {
      await runAzure(db, voice, user!.id, rows);
    }
  } catch (error) {
    if (error instanceof WorkerDispatchTimeout) {
      const { data: updated } = await db.from("voice_lab_items").select("*").in("id", ids).order("position");
      return NextResponse.json((updated ?? []).map(mapVoiceLabItem), { status: 202 });
    }
    const message = error instanceof TtsError ? error.message : "Voice generation failed.";
    await markFailed(db, ids, message);
    return NextResponse.json({ error: message }, { status: error instanceof TtsError ? error.status : 502 });
  }

  const { data: updated } = await db.from("voice_lab_items").select("*").in("id", ids).order("position");
  return NextResponse.json((updated ?? []).map(mapVoiceLabItem));
}
