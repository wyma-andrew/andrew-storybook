-- Hook titles for a finished recap: several generated options, plus whichever
-- one the user picked.
--
-- `hook_titles` is the generated set and is server-written; `hook_title` is the
-- user's choice and is the only part of this the wizard may patch. They are
-- separate columns because regenerating must not silently discard a title the
-- user already chose, and because a chosen title has to survive a re-render that
-- produces a different set.
alter table public.movie_recap_projects
  add column hook_titles jsonb not null default '[]'::jsonb,
  add column hook_title text;
