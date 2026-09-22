-- Add square social output to existing Movie Recap projects.
alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_aspect_ratio_check;

alter table movie_recap_projects
  add constraint movie_recap_projects_aspect_ratio_check
  check (aspect_ratio in ('9:16', '16:9', '1:1'));
