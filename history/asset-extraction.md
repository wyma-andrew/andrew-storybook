# Asset extraction (characters / locations / props)

Covers: `lib/prompts/extract-assets.ts`, `lib/openai.ts` (`extractAssets`,
`regenerateAssetPrompt`), `app/api/chapters/[id]/analyze`,
`app/api/chapters/[id]/sync`, `app/api/chapter-assets/[id]/regenerate`,
`app/stories/[id]/chapters/[chapterId]/assets/page.tsx`.

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
