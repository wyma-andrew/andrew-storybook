import { GeminiExhaustedError, geminiJson } from "./gemini";
import {
  RECAP_V2_AUDIT_SCHEMA,
  RECAP_V2_CONTEXT_SCHEMA,
  RECAP_V2_TRANSLATION_SCHEMA,
  recapV2AuditSystemPrompt,
  recapV2ContextSystemPrompt,
  recapV2TranslationSystemPrompt,
  type RecapV2StoryContext,
} from "./prompts/recap-v2-translation";
import { dropForeignLetters, translationProblems } from "./recap-v2-checks";
import type { RecapV2Unit } from "./recap-v2";

const BATCH_SIZE = 40;
// The tool's story-memory chunk: 80 lines or 24000 characters.
const CONTEXT_CHUNK_LINES = 80;
const CONTEXT_CHUNK_CHARS = 24000;
const LOOK_AROUND = 6;

const EMPTY_CONTEXT: RecapV2StoryContext = { characters: [], relationships: [], places: [], terms: [], plotState: [], nameConsistency: [], unresolved: [] };

function sourceLines(units: RecapV2Unit[]) {
  return units.map((unit) => `ID ${unit.id}: ${unit.source}`).join("\n");
}

export async function buildRecapV2StoryContext(units: RecapV2Unit[], language: string, onChunk: (done: number, total: number) => void, signal?: AbortSignal) {
  const chunks: RecapV2Unit[][] = [];
  let current: RecapV2Unit[] = [];
  let chars = 0;
  for (const unit of units) {
    if (current.length && (current.length >= CONTEXT_CHUNK_LINES || chars + unit.source.length > CONTEXT_CHUNK_CHARS)) { chunks.push(current); current = []; chars = 0; }
    current.push(unit);
    chars += unit.source.length;
  }
  if (current.length) chunks.push(current);

  let memory = EMPTY_CONTEXT;
  for (const [index, chunk] of chunks.entries()) {
    // 2026-10-12 in the tool: one unreadable memory answer stopped the whole
    // job. The memory only keeps names consistent, so that chunk is left out.
    try {
      memory = { ...EMPTY_CONTEXT, ...await geminiJson<RecapV2StoryContext>(
        recapV2ContextSystemPrompt(language),
        `EXISTING MEMORY:\n${JSON.stringify(memory)}\n\nSOURCE CHUNK ${index + 1}/${chunks.length}:\n${sourceLines(chunk)}`,
        RECAP_V2_CONTEXT_SCHEMA, { signal, label: `story memory ${index + 1}/${chunks.length}` }) };
    } catch (error) {
      if (signal?.aborted || error instanceof GeminiExhaustedError) throw error;
      console.warn(`[recap-v2] story memory ${index + 1}/${chunks.length} left out:`, error instanceof Error ? error.message : error);
    }
    onChunk(index + 1, chunks.length);
  }
  return memory;
}

const SPEAKABLE = /[\p{L}\p{N}]/u;

type Item = { id: number; translation: string };

function parseItems(current: RecapV2Unit[], payload: { items?: Item[] }) {
  const items = payload.items ?? [];
  const expected = current.map((unit) => unit.id);
  const got = items.map((item) => item.id);
  if (got.join(",") !== expected.join(",")) throw new Error(`ID mismatch: expected ${expected[0]}…${expected.at(-1)}, got ${got.length} items`);
  return items.map((item) => ({ id: item.id, translation: item.translation.replace(/\s+/g, " ").trim() }));
}

async function translateBatch(
  language: string,
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
  let lastItems: Item[] | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const items = parseItems(current, await geminiJson<{ items?: Item[] }>(recapV2TranslationSystemPrompt(language), prompt, RECAP_V2_TRANSLATION_SCHEMA, { signal, label: `translate ${ids[0]}–${ids.at(-1)}` }));
      lastItems = items;
      const sourceOf = new Map(current.map((unit) => [unit.id, unit.source]));
      const problems = translationProblems(items.map((item) => ({ ...item, source: sourceOf.get(item.id) ?? "" })), next[0]?.source);
      if (problems.length) throw new Error(problems.join("; "));
      return new Map(items.map((item) => [item.id, item.translation]));
    } catch (error) {
      if (signal?.aborted || error instanceof GeminiExhaustedError) throw error;
      lastError = error;
      console.warn(`[recap-v2] translation ${ids[0]}–${ids.at(-1)} attempt ${attempt}/3:`, error instanceof Error ? error.message : error);
      prompt += `\n\nCORRECTION REQUIRED: Previous response was invalid because: ${error instanceof Error ? error.message : String(error)}. Return the full CURRENT batch again with exactly ${ids.length} items. The exact items[].id sequence MUST be ${JSON.stringify(ids)}. Do not omit the final ID, renumber rows, or merge adjacent IDs.`;
    }
  }
  // As the tool does, the last ID-complete answer is kept; letters of another
  // script are dropped (the voice cannot read them) and the line stays editable.
  if (lastItems && lastItems.every((item) => SPEAKABLE.test(item.translation))) {
    return new Map(lastItems.map((item) => [item.id, dropForeignLetters(item.translation)]));
  }
  // Models occasionally drop the last ID of a long batch; smaller batches recover it.
  if (current.length > 6) {
    const middle = Math.floor(current.length / 2);
    const left = await translateBatch(language, context, previous, current.slice(0, middle), current.slice(middle, middle + LOOK_AROUND), signal);
    const right = await translateBatch(language, context, current.slice(Math.max(0, middle - LOOK_AROUND), middle), current.slice(middle), next, signal);
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
  language: string,
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
      const checks = (await geminiJson<{ checks?: { id: number; status: string; translation: string }[] }>(recapV2AuditSystemPrompt(language), prompt, RECAP_V2_AUDIT_SCHEMA, { signal, label: `audit ${ids[0]}–${ids.at(-1)}` })).checks ?? [];
      if (checks.map((check) => check.id).join(",") !== ids.join(",")) throw new Error(`audit ID mismatch: expected ${ids[0]}…${ids.at(-1)}, got ${checks.length} checks`);
      const audited = new Map(ids.map((id) => [id, translations.get(id) ?? ""]));
      for (const check of checks) {
        if (check.status !== "repair") continue;
        const replacement = check.translation.trim();
        if (!SPEAKABLE.test(replacement)) throw new Error(`missing repair translation for ID ${check.id}`);
        audited.set(check.id, dropForeignLetters(replacement));
      }
      return audited;
    } catch (error) {
      if (signal?.aborted || error instanceof GeminiExhaustedError) throw error;
      lastError = error;
      prompt = `${base}\n\nCORRECTION REQUIRED: ${error instanceof Error ? error.message : String(error)}. Return the full checks array for every CURRENT ID; do not renumber it.`;
    }
  }
  if (current.length > 6) {
    const middle = Math.floor(current.length / 2);
    const left = await auditBatch(language, context, previous, current.slice(0, middle), current.slice(middle, middle + LOOK_AROUND), translations, signal);
    const merged = new Map([...translations, ...left]);
    const right = await auditBatch(language, context, current.slice(Math.max(0, middle - LOOK_AROUND), middle), current.slice(middle), next, merged, signal);
    return new Map([...left, ...right]);
  }
  throw new Error(`Translation audit of IDs ${ids[0]}–${ids.at(-1)} could not be validated: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function translateRecapV2Units(
  allUnits: RecapV2Unit[],
  language: string,
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
      const translated = await translateBatch(language, context, previous, current, next, signal);
      onStep(`Auditing lines ${current[0].id}–${current.at(-1)!.id}`, ++done, batches.length * 2);
      const audited = await auditBatch(language, context, previous, current, next, new Map([...results, ...translated]), signal);
      for (const [id, text] of audited) results.set(id, text);
      onStep(`Translated lines ${current[0].id}–${current.at(-1)!.id}`, ++done, batches.length * 2);
    }
  }));
  return allUnits.map((unit) => ({ ...unit, text: results.get(unit.id) ?? unit.text }));
}
