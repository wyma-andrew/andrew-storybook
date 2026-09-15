import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth-guard";
import { getVoiceLabProfile, validateVoiceLabText } from "@/lib/voice-lab";
import { voiceWorkerHeaders, voiceWorkerSignal, voiceWorkerUrl } from "@/lib/voice-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const url = voiceWorkerUrl("generate");
  if (!url) {
    return NextResponse.json(
      { error: "Voice worker is not configured. Set VOICE_LAB_WORKER_URL first." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const textError = validateVoiceLabText(body?.text);
  if (textError) return NextResponse.json({ error: textError }, { status: 400 });
  const profile = getVoiceLabProfile(body?.voiceId);
  if (!profile) return NextResponse.json({ error: "Choose a supported voice profile." }, { status: 400 });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: voiceWorkerHeaders(),
      body: JSON.stringify({
        text: body.text.trim(),
        stylePrompt: profile.stylePrompt,
        seed: profile.seed,
      }),
      cache: "no-store",
      signal: voiceWorkerSignal(),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: typeof result?.detail === "string" ? result.detail : `Voice worker returned ${response.status}.` },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 },
      );
    }
    if (
      typeof result?.audioBase64 !== "string" ||
      typeof result?.durationSeconds !== "number" ||
      typeof result?.sampleRate !== "number"
    ) {
      return NextResponse.json({ error: "Voice worker returned an invalid audio response." }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Voice generation timed out."
      : "Could not reach the voice worker.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
