-- Mirroring was always on; keep that as the default and let a project turn it off.
alter table movie_recap_projects
  add column if not exists mirror_enabled boolean not null default true;
