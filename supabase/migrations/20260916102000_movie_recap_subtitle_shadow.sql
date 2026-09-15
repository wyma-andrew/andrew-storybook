-- Optional drop shadow on the subtitle text, for legibility over bright
-- footage when the background box is turned down or off.
alter table movie_recap_projects
  add column subtitle_shadow boolean not null default false;
