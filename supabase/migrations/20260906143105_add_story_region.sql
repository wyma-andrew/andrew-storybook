-- Per-story region flag: picks which prompt variant (English vs Myanmar
-- cultural adaptation) is used across asset extraction, regeneration, and
-- storyboard generation. English stays the untouched default/existing flow.
alter table stories add column region text not null default 'english';
alter table stories add constraint stories_region_check check (region in ('english', 'myanmar'));
