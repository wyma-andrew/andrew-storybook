# Voice Over

Covers: `components/ScriptEditor.tsx`, `lib/tiptap/screenplay-nodes.ts`,
`lib/tiptap/screenplay-parser.ts`, `lib/tiptap-text.ts`,
`lib/prompts/voice-over.ts`, `lib/prompts/storyboard.ts`, `lib/openai.ts`
(`assignVoiceOvers`), `app/api/chapters/[id]/storyboard/generate`,
`app/api/chapters/[id]/voice-overs`, `app/api/voice-overs/[id]`,
`app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`, and
`supabase/migrations/*_voice_over_segments.sql`.

## 2026-10-09 — Script copy uses the labelled import format

The script toolbar's Copy button writes `serializeScreenplay` output — one
`Label: text` line per block, the same format `parseScreenplayText` documents —
so a copy pasted into Import reproduces the blocks exactly, Voice Over included,
in any language. Rejected copying plain screenplay text: unlabelled import is
heuristic, and uncased scripts (Myanmar) would come back with cues and dialog
misread. Accepted consequence: line breaks inside a block become spaces, since
the parser is line-based.

## 2026-09-10 — Anonymous narration is a separate shot-range overlay

**Decision:** Voice Over is an anonymous Tiptap screenplay block, flattened as
`[VOICE_OVER]`. It has no speaker field and does not imply a visible narrator,
speaking mouth, or lip sync. Explicit import labels are supported; unlabelled
prose is never guessed to be narration.

Storyboard creation uses two AI passes. The first creates visual shots and
allows enough combined duration for natural narration. Only after that shot
list is finalized does a second pass assign each Voice Over block to one
inclusive start/end shot range. Ranges may cross scenes and leave gaps, but
must follow script order and cannot overlap. Assignment is validated before the
old storyboard is deleted, so invalid mapping does not erase existing work.

The Storyboard page shows editable narration cards above the scene list and a
Voice Over badge on every covered shot. The stored text is a snapshot of the
script at generation time; storyboard edits use `text_override` and can be
restored without changing the Script tab. Changing the script affects Voice
Over only after storyboard regeneration. Users can edit both range boundaries.

Rejected: treating Voice Over as Dialog or injecting it into each covered
shot's `videoPrompt`. Narration can span multiple shots and is produced as a
separate overlay, so per-shot duplication creates ambiguous timing and false
lip-sync instructions. Also rejected: storing the range on one shot, storing
the full text on every shot, assigning ranges before shots exist, and adding
TTS/upload/playback in this version.

Consequences:

- Every non-empty Voice Over block becomes exactly one narration segment.
- At least one distinct shot per segment is required because ranges cannot overlap.
- A regeneration replaces narration snapshots and discards their local overrides,
  just as it replaces the generated storyboard shots.
- There is no named narrator, waveform, audio file, generated speech, or timing
  below whole-shot boundaries yet.

## 2026-09-10 — Shot-range Selects truncate via a String.raw class

The "Starts at"/"Ends at" Selects hold full shot labels ("1.2 — Close reaction ·
Child in arms"), which overflow the trigger. GeckoUI exposes no prop for the
value span, and two of its own rules block truncation: `__content` is
`flex-wrap: wrap; overflow-x: scroll`, and `__value` is `display: flex`, which
makes `truncate` inert. `TRUNCATE_SELECT_VALUE` overrides all three through
`wrapperClassName`.

`String.raw` there is load-bearing, not a style choice. A bare `_` in a Tailwind
arbitrary variant means a space, so `__content` must be written `\_\_content`;
Tailwind then generates utilities by scanning the file's *raw* text, so a normal
`"..."` literal registers a class carrying two backslashes while the runtime
string carries one, and the rule never matches the element. Verified against
`@tailwindcss/cli` output, not assumed. Don't "clean this up" into a plain
string.

Rejected: `SelectTrigger` render-props (rebuilds the whole trigger's chrome for
one ellipsis) and a quoted attribute selector like
`[&_[class~='GeckoUISelectButton__value']]` — Tailwind converts the underscores
to spaces inside the quotes too, yielding a selector that matches nothing.
