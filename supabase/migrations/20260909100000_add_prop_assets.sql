-- Props are story assets alongside characters and locations. They use the
-- same prompt/bible lifecycle, but do not have a location space kind.
alter table bible_entries drop constraint if exists bible_entries_kind_check;
alter table bible_entries
  add constraint bible_entries_kind_check check (kind in ('character', 'location', 'prop'));

alter table chapter_assets drop constraint if exists chapter_assets_kind_check;
alter table chapter_assets
  add constraint chapter_assets_kind_check check (kind in ('character', 'location', 'prop'));
