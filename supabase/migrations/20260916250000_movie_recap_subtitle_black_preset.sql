-- The second preset is black text with a white outline, not white text with a
-- black outline — the reference caption it matches inverts the first preset
-- rather than recolouring it. Renaming the value keeps the stored id honest
-- about what it draws.
alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_subtitle_preset_check;

update movie_recap_projects
  set subtitle_preset = 'black'
  where subtitle_preset = 'white';

alter table movie_recap_projects
  add constraint movie_recap_projects_subtitle_preset_check
  check (subtitle_preset in ('yellow', 'black'));
