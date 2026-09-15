alter table movie_recap_projects
  add column render_stage text,
  add column render_progress_current integer,
  add column render_progress_total integer;
