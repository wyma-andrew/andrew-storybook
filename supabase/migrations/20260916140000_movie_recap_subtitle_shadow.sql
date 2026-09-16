-- Drop shadow behind the caption text. Percentage of the subtitle font size so
-- it lands the same at any output resolution, like every other subtitle size.
-- Default 0 = off, which is exactly what existing projects render today.
alter table movie_recap_projects
  add column subtitle_shadow numeric not null default 0
    check (subtitle_shadow >= 0 and subtitle_shadow <= 20),
  add column subtitle_shadow_color text not null default '#000000';
