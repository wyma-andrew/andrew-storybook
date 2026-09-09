-- Adds the historically grounded Buddha-era prompt mode while preserving
-- English as the default for existing and newly created stories.
alter table stories drop constraint stories_region_check;
alter table stories
  add constraint stories_region_check
  check (region in ('english', 'myanmar', 'buddha'));
