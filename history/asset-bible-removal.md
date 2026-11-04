# Asset Bible removal

Covers: migration `20261028150000_remove_asset_bible.sql`,
`app/api/chapters/[id]/analyze/route.ts`, `app/api/chapters/[id]/sync/route.ts`,
`lib/story-transfer.ts`, the Assets page, `components/StoryControlsMenu.tsx`.

## 2026-10-28 — The story Asset Bible is removed

**Decision (by the user).** The story-wide Asset Bible is gone, because it was
not being used: the Bible page, "Manage Bible", "Add to bible", image
promotion, the Bible badge, and bible name-matching in Analyze and Re-Sync.
Tables `bible_entries` and `bible_entry_images` and column
`chapter_assets.bible_entry_id` are dropped. Every chapter's assets now stand on
their own; a later episode does not reuse an earlier episode's prompts.

**What was kept.**
- Chapter assets already held their own copy of every prompt (a matched asset
  copied the bible prompt into `real_prompt` at Analyze time), so no prompt was
  lost. `matched` rows became `new`; `match_status` now allows only `new`,
  `local` and `stale` — `stale` (Re-Sync's "Not in script") is unrelated to the
  bible and stays.
- The migration copies each bible location image onto every chapter asset that
  was linked to that entry, skipping one the asset already has and keeping at
  most one canonical image per asset.
- Story bundles go to version 2 without a `bible`. Version 1 bundles still
  import: their bible images are folded onto the assets that pointed at them
  (the same rule as the migration) and `matched` reads as `new`.

**Accepted consequences.**
- Bible entries that no chapter asset pointed at were dropped with their images.
- Consistency across episodes now depends on name stability within a chapter
  (Re-Sync's existing-names block) and on editing each chapter's prompts; there
  is no shared identity source. If cross-episode identity is needed again, it
  is a new design, not a revert of this migration.

**Superseded reasoning (kept so it is not re-argued blind).** The bible existed
as a manual-approval gate: a chapter asset was promoted into a story-scoped
entry, and later chapters matched it by normalized name and inherited its
prompt, `space_kind`, looks, group flag and promoted images, so identity stayed
locked across episodes. Nothing was shared automatically. The decisions that
assumed it — bible matching in `history/asset-extraction.md`, bible images in
`history/chapter-images.md` and `history/camera-stations.md`, bible looks in
`history/character-looks.md`, and bible transfer in `history/story-transfer.md`
— are superseded by this entry.
