// Gemini on free-tier keys, as recap-en-to-mm runs it (recap_planner.py
// `_configure_gemini_key_pool` / `_gemini_json`): several keys, each from its
// own Google project, and a chain of models. A quota or auth rejection moves to
// the next key on the same model; when every key is used up, the next model
// starts again at key 1. A 503 / overload / timeout skips straight to the next
// model. See history/recap-v2.md.

export const GEMINI_MODEL_CHAIN = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite"];

const REQUEST_TIMEOUT_MS = 120_000;
// The tool waits up to 5 minutes per busy round; a request here has 300s in
// all, so the waits are shorter.
const BUSY_WAITS_MS = [10_000, 20_000];
// A rejected key/model pair is skipped for this long by later requests in the
// same server process, so each request does not walk the dead keys again.
const REJECTED_FOR_MS = 60 * 60 * 1000;

export const GEMINI_NOT_CONFIGURED = "Gemini is not configured. Set GEMINI_API_KEYS (comma-separated) or GEMINI_API_KEY in the environment.";

export function geminiKeys() {
  const keys = [
    ...(process.env.GEMINI_API_KEYS ?? "").split(/[\s,]+/),
    process.env.GEMINI_API_KEY ?? "",
    ...Object.keys(process.env).filter((name) => /^GEMINI_API_KEY_\d+$/.test(name))
      .sort((a, b) => Number(a.split("_").at(-1)) - Number(b.split("_").at(-1)))
      .map((name) => process.env[name] ?? ""),
  ].map((key) => key.trim()).filter(Boolean);
  return [...new Set(keys)];
}

export function geminiConfigured() {
  return geminiKeys().length > 0;
}

export class GeminiExhaustedError extends Error {}

class GeminiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const rejectedUntil = new Map<string, number>();
const pairKey = (model: string, keyIndex: number) => `${model}#${keyIndex}`;

function isKeyRejection(error: unknown) {
  if (error instanceof GeminiHttpError && [401, 403, 429].includes(error.status)) return true;
  return /resource_exhausted|api_key_invalid|api key not valid|unauthenticated|permission_denied|spending cap/i.test(String(error));
}

function isBusy(error: unknown) {
  if (error instanceof GeminiHttpError && [500, 503, 504].includes(error.status)) return true;
  return /unavailable|high demand|overloaded|deadline|timed? ?out|aborted due to timeout/i.test(String(error));
}

// Gemini's responseSchema is an OpenAPI subset: upper-case types and no
// additionalProperties. Exported for the test.
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([name]) => name !== "additionalProperties")
    .map(([name, value]) => [name, name === "type" && typeof value === "string" ? value.toUpperCase() : name === "properties" ? Object.fromEntries(Object.entries(value as object).map(([key, child]) => [key, toGeminiSchema(child)])) : toGeminiSchema(value)]));
}

function parseJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function generate(model: string, key: string, system: string, user: string, schema: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(schema) },
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GeminiHttpError(response.status, `Gemini ${model} ${response.status}: ${detail.slice(0, 300)}`);
  }
  const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini ${model} returned no text (${candidate?.finishReason ?? "no candidate"}).`);
  return text;
}

// One logical JSON request. Key and model switches resend the same prompt and
// do not count as attempts; the caller's own validation retries stay its own.
export async function geminiJson<T>(system: string, user: string, schema: unknown, { signal, label = "request" }: { signal?: AbortSignal; label?: string } = {}): Promise<T> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error(GEMINI_NOT_CONFIGURED);
  let busyRound = 0;
  let lastError: unknown;
  for (;;) {
    for (const model of GEMINI_MODEL_CHAIN) {
      let skipModel = false;
      for (let keyIndex = 0; keyIndex < keys.length && !skipModel; keyIndex++) {
        if ((rejectedUntil.get(pairKey(model, keyIndex)) ?? 0) > Date.now()) continue;
        try {
          return parseJson(await generate(model, keys[keyIndex], system, user, schema, signal)) as T;
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
          if (isKeyRejection(error)) {
            rejectedUntil.set(pairKey(model, keyIndex), Date.now() + REJECTED_FOR_MS);
            console.warn(`[gemini] ${label}: ${model} key ${keyIndex + 1}/${keys.length} rejected; next key`);
          } else if (isBusy(error)) {
            console.warn(`[gemini] ${label}: ${model} busy; next model`);
            skipModel = true;
          } else {
            throw error;
          }
        }
      }
    }
    const everyPairRejected = GEMINI_MODEL_CHAIN.every((model) => keys.every((_, index) => (rejectedUntil.get(pairKey(model, index)) ?? 0) > Date.now()));
    if (everyPairRejected || busyRound >= BUSY_WAITS_MS.length) {
      throw new GeminiExhaustedError(`Every Gemini model and key is used up or busy (${GEMINI_MODEL_CHAIN.length} models × ${keys.length} keys). Add another key or try again later. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
    console.warn(`[gemini] ${label}: every model busy; waiting ${BUSY_WAITS_MS[busyRound] / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, BUSY_WAITS_MS[busyRound++]));
  }
}
