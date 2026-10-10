-- A character whose appearance changes over the story (student -> bandit ->
-- monk) gets one look per stage, each with its own reference sheet, under one
-- asset name. Stored as JSON on the asset rather than a table: looks are only
-- ever read and written together with the asset that owns them, and the asset
-- name stays the identity key that Re-Sync and shots.assets_used match on.
-- Shape: [{ key, label, scenes, prompt }]; [] means a single look.
alter table chapter_assets add column looks jsonb not null default '[]'::jsonb;
alter table bible_entries add column looks jsonb not null default '[]'::jsonb;

-- Which look of the linked character an uploaded render is the sheet for.
-- A key, not an FK, because looks are JSON; a key that no longer exists on the
-- asset falls back to the asset's first look in the UI.
alter table chapter_images add column look_key text;
