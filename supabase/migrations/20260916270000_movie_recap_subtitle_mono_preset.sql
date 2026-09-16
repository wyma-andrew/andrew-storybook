-- The second preset goes back to black text with a white outline, and its id
-- becomes colour-neutral: `mono`. The look has now been inverted three times
-- while its reference was being settled, and an id that names the fill colour
-- means a migration on every flip. `mono` describes the pairing rather than
-- which half is which, so the next inversion is a code change only.
alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_subtitle_preset_check;

update movie_recap_projects
  set subtitle_preset = 'mono'
  where subtitle_preset in ('white', 'black');

alter table movie_recap_projects
  add constraint movie_recap_projects_subtitle_preset_check
  check (subtitle_preset in ('yellow', 'mono'));
