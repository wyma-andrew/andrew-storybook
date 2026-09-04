-- Adds "stale" as a chapter_assets.match_status value: Re-Sync with story sets an
-- asset stale (instead of deleting it) when its name no longer appears in the
-- latest extraction of the chapter's script — user then confirms removal manually.
alter table chapter_assets drop constraint chapter_assets_match_status_check;
alter table chapter_assets
  add constraint chapter_assets_match_status_check
  check (match_status in ('matched', 'new', 'local', 'stale'));
