-- The story Asset Bible is removed (history/asset-bible-removal.md). Chapter
-- assets already hold their own copy of every prompt, so only the bible's
-- location reference images need carrying over: each is copied onto every
-- chapter asset that was linked to its entry, skipping one the asset already
-- has, and keeping at most one canonical image per asset. Bible entries no
-- chapter asset points at are dropped with their images.
insert into chapter_asset_images (chapter_asset_id, angle_label, image_url, is_canonical, created_at, updated_at)
select
  ca.id,
  bi.angle_label,
  bi.image_url,
  bi.is_canonical and not exists (
    select 1 from chapter_asset_images x where x.chapter_asset_id = ca.id and x.is_canonical
  ),
  bi.created_at,
  now()
from bible_entry_images bi
join chapter_assets ca on ca.bible_entry_id = bi.bible_entry_id
where not exists (
  select 1 from chapter_asset_images x
  where x.chapter_asset_id = ca.id
    and x.angle_label = bi.angle_label
    and x.image_url is not distinct from bi.image_url
);

update chapter_assets set match_status = 'new' where match_status = 'matched';

alter table chapter_assets drop constraint chapter_assets_match_status_check;
alter table chapter_assets
  add constraint chapter_assets_match_status_check
  check (match_status in ('new', 'local', 'stale'));

alter table chapter_assets drop column bible_entry_id;

drop table bible_entry_images;
drop table bible_entries;
