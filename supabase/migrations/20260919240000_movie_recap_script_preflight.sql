-- The script step becomes a run of its own, ahead of the render.
--
-- A render used to read the source, write the script, synthesize it and cut the
-- video in one pass, so the first time anyone saw that a block had more
-- narration than its timestamps cover was an hour and a half later. Splitting
-- the two lets the user read the measured numbers, shorten the line, re-check
-- that one beat, and only then approve the cut.
--
-- Its own status columns rather than reusing the render's: both can be idle,
-- running or failed independently, and a failed preflight must not read as a
-- failed render.
alter table movie_recap_projects
  add column script_status text not null default 'idle',
  add column script_stage text,
  add column script_progress_current integer,
  add column script_progress_total integer,
  add column script_error text,
  add column script_approved boolean not null default false;

comment on column movie_recap_projects.script_status is
  'idle | running | ready | failed. "ready" means render_script holds measured beats waiting for approval.';
comment on column movie_recap_projects.script_approved is
  'Set when the user accepts the measured script. Cleared whenever a beat''s text changes, so the render can never cut words nobody checked.';
