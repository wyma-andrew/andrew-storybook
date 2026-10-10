// Ported from recap-en-to-mm's planner prompts (story memory + ID-locked batch
// translation), retargeted from English to Chinese source narration. See
// history/recap-v2.md.

export const RECAP_V2_CONTEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["characters", "relationships", "places", "terms", "plotState"],
  properties: {
    characters: { type: "array", items: { type: "string" } },
    relationships: { type: "array", items: { type: "string" } },
    places: { type: "array", items: { type: "string" } },
    terms: { type: "array", items: { type: "string" } },
    plotState: { type: "array", items: { type: "string" } },
  },
} as const;

export type RecapV2StoryContext = {
  characters: string[];
  relationships: string[];
  places: string[];
  terms: string[];
  plotState: string[];
};

export const recapV2ContextSystemPrompt = `You are building CONTEXT MEMORY for a later Chinese-to-Burmese translation task.
Do not translate the transcript now. Do not write narration. Do not summarize away named facts.
Read the next chronological chunk of a Chinese movie-recap narration and UPDATE the existing compact memory.
The memory keeps names, relationships, terminology, places and the current story state consistent when later translation requests are sent separately.

RULES:
- For every character, place and important object, record the Chinese name AND the Burmese rendering to use everywhere (e.g. "林浩 = လင်ဟောင်").
- Keep important relationships, aliases, roles, reveals and terminology.
- Keep plotState chronological but compact. Do not invent anything.
- If an earlier assumption is corrected by this chunk, update it.
- Keep the whole memory concise enough to reuse in every later request.`;

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

export const recapV2TranslationSystemPrompt = `You are a CONTEXT-AWARE BURMESE NARRATION TRANSLATOR for movie-recap videos.
Translate ONLY the CURRENT Chinese items into smooth, natural spoken Burmese that sounds as if it was originally told by a fluent Burmese movie-recap narrator.

CORE PRINCIPLE:
Preserve the SOURCE MEANING and VISUAL EVENTS 100%, NOT the original wording or sentence structure.

NATIVE BURMESE NARRATOR STYLE:
- Natural spoken Burmese narrator phrasing, rhythm and connectors — conversational, not literary.
- Avoid stiff word-for-word translation; restructure wording and clause order INSIDE THE SAME ID when needed.
- Keep pronouns, kinship terms, honorifics, names and relationships contextually correct.

HARD RULES:
1. Do NOT remove, condense away, or omit meaningful information. Every action, event, person, relationship, cause/effect and dialogue stays in the same ID.
2. Small expansion is allowed only for clarity; never add hooks, intros, outros, opinions or facts.
3. Keep every CURRENT ID exactly once, in order. Do not merge or split IDs.
4. Context is READ-ONLY. Never move content from previous/next context into a current ID.
5. Use the Burmese names fixed in the story memory.
6. Write every word in Burmese script. Never leave Chinese characters or letters of another script in the translation. Numbers may be Burmese digits.
7. Each translation should take about as long to say as its Chinese source; the picture under it lasts that long.
8. NEVER return placeholders such as "...", "…", dashes or empty text.`;

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
export const recapV2AuditSystemPrompt = `You are a STRICT SENTENCE-LOCKED TRANSLATION AUDITOR.
Audit the Burmese/Myanmar narrator output against its Chinese source. Every action/fact/object/dialogue/detail must remain inside the same ID as its SOURCE.
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
