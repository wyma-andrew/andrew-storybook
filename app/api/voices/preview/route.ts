import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { synthesize, TtsError } from "@/lib/tts/synthesize";
import { getVoiceById } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const maxDuration = 300;

// A voice's preview is its own `sampleText` in its own voice — the same short
// line every time, for every user. Synthesizing that again per click would burn
// provider quota on audio that cannot differ, so the first caller pays for it
// and everyone after hears the cached bytes. The catalog is small and fixed,
// so the cache has a fixed ceiling
// and lives for the process — same single-process assumption the render's
// cancel map already makes.
const previewCache = new Map<string, string>();

export async function POST(request: NextRequest) {
  const { unauthorized } = await requireFeature("movie_recap");
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const voice = getVoiceById(body?.voiceId);
  if (!voice) return NextResponse.json({ error: "Unknown voice profile." }, { status: 400 });

  const cacheKey = voice.providerId === "voxcpm"
    ? `${voice.id}:${voice.params.referenceAudioHash}:${voice.params.referenceText ?? ""}:${voice.params.stylePrompt}:${voice.params.seed}`
    : voice.id;
  const cached = previewCache.get(cacheKey);
  if (cached) return NextResponse.json({ audioBase64: cached, contentType: "audio/wav", cached: true });

  try {
    const result = await synthesize({ text: voice.sampleText, voice });
    const audioBase64 = result.audio.toString("base64");
    previewCache.set(cacheKey, audioBase64);
    return NextResponse.json({ audioBase64, contentType: "audio/wav", cached: false });
  } catch (error) {
    if (error instanceof TtsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not generate the voice preview." }, { status: 502 });
  }
}
