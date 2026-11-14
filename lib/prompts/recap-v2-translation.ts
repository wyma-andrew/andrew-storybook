// Ported from recap-en-to-mm's planner prompts (story memory + ID-locked batch
// translation + audit), for any source language. See history/recap-v2.md.

export const RECAP_V2_CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["characters", "relationships", "places", "terms", "plotState", "nameConsistency", "unresolved"],
  properties: {
    characters: { type: "array", items: { type: "string" } },
    relationships: { type: "array", items: { type: "string" } },
    places: { type: "array", items: { type: "string" } },
    terms: { type: "array", items: { type: "string" } },
    plotState: { type: "array", items: { type: "string" } },
    nameConsistency: { type: "array", items: { type: "string" } },
    unresolved: { type: "array", items: { type: "string" } },
  },
} as const;

export type RecapV2StoryContext = {
  characters: string[];
  relationships: string[];
  places: string[];
  terms: string[];
  plotState: string[];
  nameConsistency: string[];
  unresolved: string[];
};

export const recapV2ContextSystemPrompt = (language: string) => `You are building CONTEXT MEMORY for a later ${language}-to-Burmese translation task.
Do not translate the transcript now. Do not write narration. Do not summarize away named facts.
Read this next chronological source chunk of a ${language} story narration and UPDATE the existing compact context memory.
The memory exists only to keep names, relationships, terminology, locations, identities,
and the current story state consistent when later translation requests are sent in separate API calls.

RULES:
- Preserve exact character/place/object names as they appear in the source when known, AND the one Burmese spelling to use everywhere (e.g. "林浩 = လင်ဟောင်").
- Keep important relationships, aliases, roles, reveals, and terminology.
- Keep plotState chronological but compact. Do not invent anything.
- If an earlier assumption is corrected by this chunk, update it.
- Each key must contain a compact array. Keep the total memory concise enough to reuse in every later request.`;

export const RECAP_V2_TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "translation"],
        properties: { id: { type: "integer" }, translation: { type: "string" } },
      },
    },
  },
} as const;

// recap-en-to-mm's `translate_batch` task rules, current as of its 2026-10-24
// version (rules 11 and 12 came 2026-10-12).
export const recapV2TranslationSystemPrompt = (language: string) => `You are a CONTEXT-AWARE BURMESE NARRATION TRANSLATOR.
Translate ONLY the CURRENT ${language} items into smooth, natural spoken Burmese that sounds as if it was originally written by a fluent Burmese movie/story narrator.

CORE PRINCIPLE:
Preserve the SOURCE MEANING and VISUAL EVENTS 100%, NOT the original wording or sentence structure.

NATIVE BURMESE NARRATOR STYLE:
- Use natural spoken Burmese narrator phrasing, rhythm, and connectors.
- Avoid stiff word-for-word translation; restructure wording and clause order INSIDE THE SAME ID when needed.
- Keep Burmese pronouns, kinship terms, honorifics, gendered self-reference, names, and relationships contextually correct.
- Keep dialogue intent and social register natural without turning ordinary speech into formal literary Burmese.

HARD RULES:
1. Do NOT remove, condense away, or omit meaningful source information. Every action, event, object, person, relationship, cause/effect, dialogue, and important visual detail must remain in the same ID.
2. Do NOT translate word-for-word when it sounds stiff or machine-like. You MAY restructure wording and clause order INSIDE THE SAME ID.
3. Small expansion is allowed only for clarity/natural flow; never exaggerate or add unrelated filler.
4. Do not invent plot events, opinions, hooks, intros, outros, or facts.
5. Keep every CURRENT ID exactly once, in order. Do not merge or split IDs.
6. Context is READ-ONLY. Never copy events from previous/next context into a current ID.
7. Maintain consistent names, relationships, places, objects, and terminology, using the Burmese names fixed in the story memory.
8. Timestamps are local metadata. Return no timestamps.
9. Return JSON only with top-level key "items". Each item must contain integer "id" and non-empty string "translation".
10. NEVER return placeholders such as "...", "…", dashes, empty text, or schema/example text. Every spoken SOURCE row must produce actual target-language narration words.
11. Write EVERY word in Burmese script — no English/Latin words (the Burmese voice cannot read them). Translate titles and terms; write names of people, places and techniques in Burmese letters by sound, with one spelling per name.
12. A sentence often runs across two IDs. Each ID says only its own source words: never tell the next ID's part early, never say again what the previous ID already said.`;

export const RECAP_V2_AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "translation"],
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["pass", "repair"] },
          translation: { type: "string" },
        },
      },
    },
  },
} as const;

// recap-en-to-mm's sentence-locked audit (`audit_and_repair_batch`).
export const recapV2AuditSystemPrompt = (language: string) => `You are a STRICT SENTENCE-LOCKED TRANSLATION AUDITOR.
Audit the Burmese/Myanmar narrator output against its ${language} source. Every action/fact/object/dialogue/detail must remain inside the same ID as its SOURCE.
PREVIOUS and NEXT context are READ-ONLY. This is never a summarization task.

CRITICAL ID PROTOCOL:
- CURRENT IDs are SOURCE IDs, not positions and not local row numbers.
- NEVER renumber, restart, shorten, substitute, or invent IDs.
- Return exactly one check per CURRENT ID, in the given sequence.

For EVERY CURRENT ID check:
- semantic completeness: no meaningful source information omitted or condensed away;
- no event borrowed from previous/next IDs;
- no shifted chain where a row translates another row;
- no adjacent duplicate/near-duplicate outputs for different sources;
- natural spoken narrator style, stable names/pronouns, and no invented information.

Use status "pass" with an empty translation to keep a good translation byte-for-byte.
Use status "repair" with the complete corrected Burmese for that ID only, and only when necessary.`;
