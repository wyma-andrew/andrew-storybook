-- Keep the existing contain preview/render behavior, but make it an explicit
-- project setting users can turn off.
alter table movie_recap_projects
  add column if not exists dynamic_background_blur_enabled boolean not null default true;
