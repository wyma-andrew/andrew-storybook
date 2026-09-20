-- The copyright-free transform stops being a toggle: the blurred backfill,
-- mirror and colour grade are how a recap looks now, and the per-shot playback
-- speed is gone entirely. Zoom stays, as its own slider.
alter table movie_recap_projects
  drop column copyright_free;
