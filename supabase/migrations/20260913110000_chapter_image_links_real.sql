-- Uploaded images can now be attached to the asset or the shot they were
-- generated for. Deliberately NOT a new table and NOT part of the reference-image
-- system: chapter_asset_images / bible_entry_images stay exactly as they are
-- (URL-only, canonical flag, promote-to-bible). These are finished renders
-- hanging off the thing that produced them.
--
-- Both links are nullable and both are ON DELETE SET NULL, which is the whole
-- orphaning design: delete an asset, or regenerate a scene (which deletes and
-- reinserts its shots), and the images that pointed at them fall back to NULL on
-- their own. "Unused" is then simply "both links are null" — derived, never
-- stored, so it cannot go stale. No cleanup job, no maintenance flag.
--
-- An image links to at most one of the two. The check keeps a row from claiming
-- to be both an asset render and a shot render, which nothing in the UI can
-- produce but which would make the gallery's label ambiguous.
alter table chapter_images
  add column chapter_asset_id uuid references chapter_assets(id) on delete set null,
  add column shot_id uuid references shots(id) on delete set null;

alter table chapter_images
  add constraint chapter_images_single_link
  check (chapter_asset_id is null or shot_id is null);

create index chapter_images_chapter_asset_id_idx on chapter_images (chapter_asset_id);
create index chapter_images_shot_id_idx on chapter_images (shot_id);
