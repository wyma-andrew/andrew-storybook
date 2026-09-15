const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function voiceWorkerUrl(path: string) {
  const raw = process.env.VOICE_LAB_WORKER_URL?.trim();
  if (!raw) return null;

  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    return null;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return null;
  return new URL(path.replace(/^\//, ""), `${base.toString().replace(/\/$/, "")}/`);
}

export function voiceWorkerHeaders() {
  const token = process.env.VOICE_LAB_WORKER_TOKEN?.trim();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export function voiceWorkerSignal(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return AbortSignal.timeout(timeoutMs);
}
