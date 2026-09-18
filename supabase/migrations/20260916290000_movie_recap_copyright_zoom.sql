-- Zoom stops being a code constant and becomes a per-project value, so it can be
-- set from the customize step. 1 means no zoom (it is a divisor: crop = iw/zoom),
-- which is also what a project with copyright-free off carries.
alter table movie_recap_projects
  add column copyright_zoom real not null default 1;

alter table movie_recap_projects
  add constraint movie_recap_projects_copyright_zoom_check
  check (copyright_zoom >= 1 and copyright_zoom <= 2);
