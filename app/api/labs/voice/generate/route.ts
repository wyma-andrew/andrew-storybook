import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth-guard";
import { getVoiceLabProfile, validateVoiceLabText } from "@/lib/voice-lab";
import { synthesize, TtsError } from "@/lib/tts/synthesize";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const textError = validateVoiceLabText(body?.text);
  if (textError) return NextResponse.json({ error: textError }, { status: 400 });
  const voice = getVoiceLabProfile(body?.voiceId);
  if (!voice) return NextResponse.json({ error: "Choose a supported voice profile." }, { status: 400 });

  // The route no longer knows which service speaks — it hands the voice to the
  // TTS layer, which picks the provider off the voice itself. That is what
  // lets the lab compare Azure against the self-hosted worker unchanged.
  const startedAt = Date.now();
  try {
    const result = await synthesize({ text: body.text.trim(), voice });
    return NextResponse.json({
      audioBase64: result.audio.toString("base64"),
      contentType: "audio/wav",
      durationSeconds: result.durationSeconds,
      sampleRate: result.sampleRate,
      generationMs: Date.now() - startedAt,
      providerId: voice.providerId,
    });
  } catch (error) {
    if (error instanceof TtsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Voice generation failed." }, { status: 502 });
  }
}
