# Asset extraction (characters / locations / props)

Covers: `lib/prompts/extract-assets.ts`, `lib/openai.ts` (`extractAssets`,
`regenerateAssetPrompt`), `app/api/chapters/[id]/analyze`,
`app/api/chapters/[id]/sync`, `app/api/chapter-assets/[id]/regenerate`,
`app/stories/[id]/chapters/[chapterId]/assets/page.tsx`.

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
