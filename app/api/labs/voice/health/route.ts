import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/api/auth-guard";
import { voiceWorkerHeaders, voiceWorkerSignal, voiceWorkerUrl } from "@/lib/voice-worker";

export const runtime = "nodejs";

export async function GET() {
  const { unauthorized } = await requireFeature("voice_lab");
  if (unauthorized) return unauthorized;

  const url = voiceWorkerUrl("health");
  if (!url) {
    return NextResponse.json({
      configured: false,
      reachable: false,
      message: "Set VOICE_LAB_WORKER_URL to connect the self-hosted voice worker.",
    });
  }

  try {
    const response = await fetch(url, {
      headers: voiceWorkerHeaders(),
      cache: "no-store",
      signal: voiceWorkerSignal(5_000),
    });
    if (!response.ok) throw new Error(`Worker returned ${response.status}.`);
    const worker = await response.json();
    return NextResponse.json({
      configured: true,
      reachable: true,
      model: typeof worker.model === "string" ? worker.model : "openbmb/VoxCPM2",
      device: typeof worker.device === "string" ? worker.device : "unknown",
      loaded: worker.loaded === true,
      message: worker.loaded ? "Voice worker is ready." : "Voice worker is reachable; the model loads on first generation.",
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      reachable: false,
      message: error instanceof Error ? `Voice worker is unreachable: ${error.message}` : "Voice worker is unreachable.",
    });
  }
}
