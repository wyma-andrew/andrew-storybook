import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { objectExists, publicUrlFor, putObject } from "@/lib/r2";
import { synthesize, TtsError } from "@/lib/tts/synthesize";
import { getVoiceById, VOICES } from "@/lib/tts/voices";

export const runtime = "nodejs";
export const maxDuration = 300;

// A voice's preview is its own `sampleText` in its own voice — the same line
// every time, for every user — so it is synthesized once and kept in R2. The
// key hashes the sample text and the voice's params: changing a reference,
// prompt or seed gives it a new key instead of serving a stale sample. See history/voice-lab.md.
function previewKey(voice: NonNullable<ReturnType<typeof getVoiceById>>) {
  const hash = createHash("sha256").update(JSON.stringify([voice.id, voice.sampleText, voice.params])).digest("hex").slice(0, 16);
  return `voice-previews/${voice.id}-${hash}.wav`;
}

const known = new Set<string>();

export async function GET() {
  const { unauthorized } = await requireFeature(["movie_recap", "voice_lab"]);
  if (unauthorized) return unauthorized;

  try {
    const entries = await Promise.all(VOICES.map(async (voice) => {
      if (voice.previewUrl) return [voice.id, voice.previewUrl] as const;
      const key = previewKey(voice);
      if (known.has(key) || (await objectExists(key))) {
        known.add(key);
        return [voice.id, publicUrlFor(key)] as const;
      }
      return [voice.id, null] as const;
    }));
    return NextResponse.json(Object.fromEntries(entries));
  } catch {
    return NextResponse.json({ error: "Could not read voice previews." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { unauthorized } = await requireFeature(["movie_recap", "voice_lab"]);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const voice = getVoiceById(body?.voiceId);
  if (!voice) return NextResponse.json({ error: "Unknown voice profile." }, { status: 400 });

  const key = previewKey(voice);
  try {
    if (known.has(key) || (await objectExists(key))) {
      known.add(key);
      return NextResponse.json({ url: publicUrlFor(key), cached: true });
    }
    const result = await synthesize({ text: voice.sampleText, voice });
    const url = await putObject(key, result.audio, "audio/wav");
    known.add(key);
    return NextResponse.json({ url, cached: false });
  } catch (error) {
    if (error instanceof TtsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not generate the voice preview." }, { status: 502 });
  }
}
