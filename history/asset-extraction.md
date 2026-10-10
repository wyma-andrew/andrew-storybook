# Asset extraction (characters / locations / props)

Covers: `lib/prompts/extract-assets.ts`, `lib/openai.ts` (`extractAssets`,
`regenerateAssetPrompt`), `app/api/chapters/[id]/analyze`,
`app/api/chapters/[id]/sync`, `app/api/chapter-assets/[id]/regenerate`,
`app/stories/[id]/chapters/[chapterId]/assets/page.tsx`.

## 2026-10-10 — Extraction reads the story before writing assets

Extraction was keying off surface words: a `[SCENE]` heading or an object noun
became an asset. On the Angulimala chapter it merged the forest path and the
separate forest clearing into one `DENSE FOREST` and dropped the forest
monastery (scene 8) entirely.

Decision: `ASSET_SCHEMA` now opens with `storyAnalysis` (`sceneMap`, `places`,
`characterArcs`), and every asset carries `scenes` + `evidence` ahead of
`realPrompt`. Strict JSON output is written in schema order, so the model maps
scenes to physical places and justifies each grouping before any asset exists.
`storyComprehensionBlock()` (shared with single-asset regenerate) holds the
rules: headings are not proof of a separate place, build each asset from every
scene it appears in, mention-only entities are not assets, props need a story
role. Both calls run at `reasoning_effort: "high"`. Single call, not a separate
analysis pass — cheaper, and the analysis stays in context.

Same chapter after: path / clearing / monastery / town / countryside as five
locations, each with its scene list. `storyAnalysis` is logged
(`[extractAssets] storyAnalysis`) and never stored; `scenes` and `evidence` are
not stored either — routes map columns explicitly.

Rejected, by the user: splitting the script into eras (a modern frame story vs.
the Buddha-era flashback) so region adaptation applies per era. A Buddha-region
story is Buddha-era content throughout.

Consequences: extraction took ~137 s on an 11-scene chapter. `characterArcs` is
analysis-only for now; it does not yet produce per-stage character looks (one
IDENTITY/WARDROBE LOCK per character is unchanged). Bible-matched assets still
inherit the bible prompt, so they don't benefit until regenerated.

## 2026-10-09 — GPT-5.6 models moved to GPT-6

**Decision, by the user:** every `gpt-5.6-luna` call is now `gpt-6-luna` and
every `gpt-5.6-sol` call is `gpt-6-sol` (all in `lib/openai.ts` and
`lib/recap-v2-translate.ts`). Both were checked against the account's model
list and accept strict JSON-schema Chat Completions. The Luna/Sol split stays:
Sol for Burmese prose, Luna for structured passes. `gpt-5.4-mini` (Movie
Recap vision/split) is unchanged: it is not a 5.6 model and was chosen for the
free tier. Output quality on the new models has not been re-reviewed.

## 2026-09-10 — Known real identities are prompt context, not asset names

Character prompts may include a `KNOWN IDENTITY` line for an unambiguously
identifiable historical, religious, or public figure. The value uses the
established English name so an image model can recognize the subject even when
the script uses a title or a name in another language. Fictional, ambiguous,
and unknown characters omit the line.

`CHARACTER` and `chapter_assets.name` still preserve the script's exact spelling.
Rejected replacing or translating the asset name with the canonical name because
Re-Sync identity matching and `shots.assets_used` references are name-based.

## 2026-09-10 — Character info is editable per chapter; names are not

Character cards in the Assets step allow editing the short `meta` information
and detailed `real_prompt`, but not the character name. The edit updates the
existing `chapter_assets` row, including when that row is matched to the story
Bible, so it affects this episode only. Re-Sync preserves the edit; Regenerate
or a full Re-analyze can still replace the prompt.

The edit affordance is a pencil icon at the right side of the character-card
header. It opens a dialog rather than turning the card into an inline form, so
the card layout and its copy/regenerate actions remain stable while editing.

Character names remain read-only because Re-Sync identity matching and
`shots.assets_used` references are name-based. Rejected exposing the name in the
editor because renaming would break those name-based relationships.

## 2026-09-09 — Props became a third asset kind

`kind` is now `character | location | prop` end to end: `AssetKind` in
`lib/api/types.ts`, migration `20260909100000_add_prop_assets.sql` (check
constraint on `bible_entries` and `chapter_assets`), `SYSTEM_PROMPTS.prop`
reference-sheet preset, a Prop Prompts section on the chapter Assets page, and a
Props section on the Bible page.

Props are extracted only when they are distinct, story-relevant objects that
appear, are handled, or recur — not every incidental background object. Their
`realPrompt` uses PROP / IDENTITY LOCK / VARIABLE sections.

**Props have no reference-image slots.** The per-angle image UI is gated on
`kind === "location"` and was left that way. Adding it is open work, not an
oversight to "fix" silently.

## 2026-09-10 — Anonymous Voice Over can reveal visual assets

`[VOICE_OVER]` is accepted as script structure during extraction and single-
asset regeneration. Its narration may establish a character, location, or prop
that still needs a visual reference, but the block has no speaker identity and
must never create a narrator character merely because narration exists.

This keeps asset discovery faithful to visually relevant narration without
mixing the separate concepts of an audio voice and an on-screen identity.

## 2026-09-09 — One physical place = one location (merge at extraction)

**Decision: locations are merged during extraction, never by a later
reconciliation pass.**

A house's front yard, backyard, porch and grounds must come out as ONE location
with several VIEWS, one STRUCTURE SHELL and one FIXED LAYOUT. Separate rooms, or
an interior and an unrelated exterior, stay separate. Rule lives in
`extractAssetsSystemPrompt`.

Rejected alternative — a "Regenerate all locations" endpoint that merged
existing rows afterwards (built, then deleted the same day: route
`chapters/:id/locations/regenerate`, `lib/prompts/regenerate-locations.ts`,
`regenerateLocations()`). Merging after the fact has to rename and delete rows
that already carry bible links, reference images, and names the script still
uses, which forces an alias column, alias-aware sync matching, and bible
relinking — and Re-Sync silently undid every merge. Merging at extraction means
the duplicates never exist.

**Do not reintroduce a merge-after-extraction pass.** If merging existing rows
without a full Re-analyze is needed, that is a new decision — raise it first.

## 2026-09-09 — Name stability across Re-Sync

`extractAssets(script, styleContext, region, existingNames)`. Re-Sync passes its
non-stale rows as `kind: name`; the model must return the same entity under the
exact same name. Without it, a re-worded name inserts a duplicate and flags the
original stale — which is also how merged location names would get lost.

**With no names the user message stays the bare script**, byte-identical to
before the parameter existed. Re-analyze is a full rebuild and passes nothing;
wrapping its script in a `Script:` header shifted extraction for no benefit.
Keep that branch.

## Known consequences (accepted, not bugs to "fix" quietly)

- Re-analyze deletes and re-inserts all `chapter_assets`, so
  `chapter_asset_images` cascade away. Pre-existing; now more visible because
  Re-analyze is the way to merge already-split locations.
- Merged locations come back as `match_status: "new"` and the pre-merge bible
  entries linger — the merged name no longer matches them. Manual bible cleanup.
- `shots.assets_used` stores names, so old shots keep pre-merge location names
  until the storyboard is regenerated.
- The extraction system prompt is shared by all three kinds, so prop wording
  drifts character output slightly. Accepted over branching the prompt per kind.

## 2026-09-10 — Re-analyze confirms before rebuilding

The toolbar "Re-analyze" button ran on a single click while every other
destructive action on the page (regenerate one, regenerate all, remove) went
through `ConfirmDialog`. Re-analyze is the most destructive of them: it deletes
and re-inserts all `chapter_assets`, taking hand-edited prompts and the
cascading `chapter_asset_images` with them.

Decision: `confirmReanalyze()` wraps the toolbar button; the dialog names what
is lost (prompts, edits, reference images).

Rejected: confirming inside `reanalyze()` itself. The empty-state CTA ("Analyze
script") shares that function and has nothing to destroy — a dialog there is
pure friction. The split is deliberate; don't collapse it.

## 2026-09-11 — Asset card prompts collapse to two lines

Asset prompts run long enough that a chapter's card grid became unscannable, so
`real_prompt` on the Assets step renders through `components/ui/ClampedText.tsx`,
clamped to four lines with a Show more / Show less toggle on its own line below
the text. Rejected placing the toggle inline at the end of the last clamped line
over a gradient fade — it read as part of the prompt text. Text-only label, no
chevron icon. The toggle renders only when the text actually overflows (measured with `scrollHeight` vs `clientHeight`
under a `ResizeObserver`), so short prompts keep a clean card.

Expanded state is per card and not persisted — collapsing on navigation is the
intended behaviour, since the card grid's purpose is scanning, and the full text
is also reachable via Copy prompt and the character edit dialog.

Rejected truncating the stored/copied text: the clamp is display-only; copy
actions still use the whole prompt.
