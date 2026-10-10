import { openai } from "./openai";
import {
  RECAP_V2_AUDIT_SCHEMA,
  RECAP_V2_CONTEXT_SCHEMA,
  RECAP_V2_TRANSLATION_SCHEMA,
  recapV2AuditSystemPrompt,
  recapV2ContextSystemPrompt,
  recapV2TranslationSystemPrompt,
  type RecapV2StoryContext,
} from "./prompts/recap-v2-translation";
import type { RecapV2Unit } from "./recap-v2";

const CONTEXT_MODEL = "gpt-6-luna";
// The Burmese is heard as narration, so it runs on the model the other
// Burmese passes use for prose quality.
const TRANSLATION_MODEL = "gpt-6-sol";
const BATCH_SIZE = 40;
const CONTEXT_CHUNK_CHARS = 12000;
const LOOK_AROUND = 6;

const EMPTY_CONTEXT: RecapV2StoryContext = { characters: [], relationships: [], places: [], terms: [], plotState: [] };

function sourceLines(units: RecapV2Unit[]) {
  return units.map((unit) => `ID ${unit.id}: ${unit.source}`).join("\n");
}

export async function buildRecapV2StoryContext(units: RecapV2Unit[], onChunk: (done: number, total: number) => void, signal?: AbortSignal) {
  const chunks: RecapV2Unit[][] = [];
  let current: RecapV2Unit[] = [];
  let chars = 0;
  for (const unit of units) {
    if (current.length && chars + unit.source.length > CONTEXT_CHUNK_CHARS) { chunks.push(current); current = []; chars = 0; }
    current.push(unit);
    chars += unit.source.length;
  }
  if (current.length) chunks.push(current);

  let memory = EMPTY_CONTEXT;
  for (const [index, chunk] of chunks.entries()) {
    const res = await openai().chat.completions.create({
      model: CONTEXT_MODEL,
      messages: [
        { role: "system", content: recapV2ContextSystemPrompt },
        { role: "user", content: `EXISTING MEMORY:\n${JSON.stringify(memory)}\n\nSOURCE CHUNK ${index + 1}/${chunks.length}:\n${sourceLines(chunk)}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "recap_v2_context", schema: RECAP_V2_CONTEXT_SCHEMA, strict: true } },
    }, { signal });
    memory = JSON.parse(res.choices[0]?.message?.content ?? "{}") as RecapV2StoryContext;
    onChunk(index + 1, chunks.length);
  }
  return memory;
}

const FOREIGN_LETTERS = /[\p{Script=Han}\p{Script=Georgian}\p{Script=Thai}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const SPEAKABLE = /[\p{L}\p{N}]/u;

function validate(current: RecapV2Unit[], raw: string) {
  const items = (JSON.parse(raw) as { items?: { id: number; translation: string }[] }).items ?? [];
  const expected = current.map((unit) => unit.id);
  const got = items.map((item) => item.id);
  if (got.join(",") !== expected.join(",")) throw new Error(`ID mismatch: expected ${expected[0]}…${expected.at(-1)}, got ${got.length} items`);
  const empty = items.filter((item) => !SPEAKABLE.test(item.translation)).map((item) => item.id);
  if (empty.length) throw new Error(`IDs ${empty.join(", ")} have no speakable words; write the narration`);
  const foreign = items.filter((item) => FOREIGN_LETTERS.test(item.translation)).map((item) => item.id);
  if (foreign.length) throw new Error(`IDs ${foreign.join(", ")} contain Chinese or another script; write every word in Burmese`);
  return items;
}

async function translateBatch(
  context: RecapV2StoryContext,
  previous: RecapV2Unit[],
  current: RecapV2Unit[],
  next: RecapV2Unit[],
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const ids = current.map((unit) => unit.id);
  let prompt = `STORY CONTEXT MEMORY:\n${JSON.stringify(context)}\n\nPREVIOUS CONTEXT (READ-ONLY):\n${previous.length ? sourceLines(previous) : "(none)"}\n\n`
    + `CURRENT ITEMS — TRANSLATE ALL OF THESE, ONE-FOR-ONE:\n${sourceLines(current)}\n\n`
    + `NEXT CONTEXT (READ-ONLY):\n${next.length ? sourceLines(next) : "(none)"}\n\n`
    + `Return exactly ${ids.length} items with this exact id sequence: ${JSON.stringify(ids)}`;
  let lastError: unknown;
  let lastItems = null as { id: number; translation: string }[] | null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await openai().chat.completions.create({
        model: TRANSLATION_MODEL,
        messages: [{ role: "system", content: recapV2TranslationSystemPrompt }, { role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: { name: "recap_v2_translation", schema: RECAP_V2_TRANSLATION_SCHEMA, strict: true } },
      }, { signal });
      const raw = res.choices[0]?.message?.content ?? "{}";
      try {
        return new Map(validate(current, raw).map((item) => [item.id, item.translation.trim()]));
      } catch (error) {
        const parsed = (JSON.parse(raw) as { items?: { id: number; translation: string }[] }).items ?? [];
        if (parsed.map((item) => item.id).join(",") === ids.join(",")) lastItems = parsed;
        throw error;
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      prompt += `\n\nCORRECTION REQUIRED: the previous response was invalid because: ${error instanceof Error ? error.message : String(error)}. Return the full CURRENT batch again.`;
    }
  }
  // A stray foreign letter on the last attempt is not worth failing the batch over;
  // it is stripped and the line stays editable.
  if (lastItems) return new Map(lastItems.map((item) => [item.id, item.translation.replace(new RegExp(FOREIGN_LETTERS.source, "gu"), "").trim()]));
  // Models occasionally drop the last ID of a long batch; smaller batches recover it.
  if (current.length > 6) {
    const middle = Math.floor(current.length / 2);
    const left = await translateBatch(context, previous, current.slice(0, middle), current.slice(middle, middle + LOOK_AROUND), signal);
    const right = await translateBatch(context, current.slice(Math.max(0, middle - LOOK_AROUND), middle), current.slice(middle), next, signal);
    return new Map([...left, ...right]);
  }
  throw new Error(`Translation of IDs ${ids[0]}–${ids.at(-1)} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function auditLines(units: RecapV2Unit[], translations: Map<number, string>) {
  return units.map((unit) => `ID ${unit.id}: SOURCE: ${unit.source}\nOUTPUT: ${translations.get(unit.id) ?? unit.text}`).join("\n");
}

// The tool's sentence-locked audit: a second pass checks every translated ID
// against its source and may rewrite only the IDs that fail. Two attempts, then
// the same rows are re-audited in halves; a window that still cannot be
// validated fails the step, as the tool does.
async function auditBatch(
  context: RecapV2StoryContext,
  previous: RecapV2Unit[],
  current: RecapV2Unit[],
  next: RecapV2Unit[],
  translations: Map<number, string>,
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const ids = current.map((unit) => unit.id);
  const base = `STORY CONTEXT:\n${JSON.stringify(context)}\n\nPREVIOUS CONTEXT (READ-ONLY):\n${previous.length ? auditLines(previous, translations) : "(none)"}\n\n`
    + `CURRENT ITEMS TO AUDIT:\n${auditLines(current, translations)}\n\n`
    + `NEXT SOURCE CONTEXT (READ-ONLY):\n${next.length ? sourceLines(next) : "(none)"}\n\n`
    + `FINAL ID CHECK BEFORE YOU RESPOND: your checks[].id list MUST equal exactly ${JSON.stringify(ids)}`;
  let prompt = base;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await openai().chat.completions.create({
        model: TRANSLATION_MODEL,
        messages: [{ role: "system", content: recapV2AuditSystemPrompt }, { role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: { name: "recap_v2_audit", schema: RECAP_V2_AUDIT_SCHEMA, strict: true } },
      }, { signal });
      const checks = (JSON.parse(res.choices[0]?.message?.content ?? "{}") as { checks?: { id: number; status: string; translation: string }[] }).checks ?? [];
      if (checks.map((check) => check.id).join(",") !== ids.join(",")) throw new Error(`audit ID mismatch: expected ${ids[0]}…${ids.at(-1)}, got ${checks.length} checks`);
      const audited = new Map(ids.map((id) => [id, translations.get(id) ?? ""]));
      for (const check of checks) {
        if (check.status !== "repair") continue;
        const replacement = check.translation.trim();
        if (!SPEAKABLE.test(replacement)) throw new Error(`missing repair translation for ID ${check.id}`);
        audited.set(check.id, replacement);
      }
      return audited;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      prompt = `${base}\n\nCORRECTION REQUIRED: ${error instanceof Error ? error.message : String(error)}. Return the full checks array for every CURRENT ID; do not renumber it.`;
    }
  }
  if (current.length > 6) {
    const middle = Math.floor(current.length / 2);
    const left = await auditBatch(context, previous, current.slice(0, middle), current.slice(middle, middle + LOOK_AROUND), translations, signal);
    const merged = new Map([...translations, ...left]);
    const right = await auditBatch(context, current.slice(Math.max(0, middle - LOOK_AROUND), middle), current.slice(middle), next, merged, signal);
    return new Map([...left, ...right]);
  }
  throw new Error(`Translation audit of IDs ${ids[0]}–${ids.at(-1)} could not be validated: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function translateRecapV2Units(
  allUnits: RecapV2Unit[],
  context: RecapV2StoryContext,
  onStep: (stage: string, done: number, total: number) => void,
  signal?: AbortSignal
) {
  const units = allUnits.filter((unit) => !unit.muted);
  const batches: number[] = [];
  for (let from = 0; from < units.length; from += BATCH_SIZE) batches.push(from);
  const results = new Map<number, string>();
  let done = 0;
  // Three at a time: context is source text only, so batches do not depend on
  // each other's output and a long source fits the route's time limit.
  const queue = [...batches];
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (queue.length) {
      const from = queue.shift()!;
      const previous = units.slice(Math.max(0, from - LOOK_AROUND), from);
      const current = units.slice(from, from + BATCH_SIZE);
      const next = units.slice(from + BATCH_SIZE, from + BATCH_SIZE + LOOK_AROUND);
      const translated = await translateBatch(context, previous, current, next, signal);
      onStep(`Auditing lines ${current[0].id}–${current.at(-1)!.id}`, ++done, batches.length * 2);
      const audited = await auditBatch(context, previous, current, next, new Map([...results, ...translated]), signal);
      for (const [id, text] of audited) results.set(id, text);
      onStep(`Translated lines ${current[0].id}–${current.at(-1)!.id}`, ++done, batches.length * 2);
    }
  }));
  return allUnits.map((unit) => ({ ...unit, text: results.get(unit.id) ?? unit.text }));
}
