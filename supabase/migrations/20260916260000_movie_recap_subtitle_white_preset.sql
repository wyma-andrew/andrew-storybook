-- The second preset goes back to white text on a black outline, so the stored id
-- goes back to 'white'. (It was 'white' before 20260916250000 renamed it to
-- 'black'; the look itself has been inverted twice while the reference was being
-- pinned down. The id always names what it draws.)
alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_subtitle_preset_check;

update movie_recap_projects
  set subtitle_preset = 'white'
  where subtitle_preset = 'black';

alter table movie_recap_projects
  add constraint movie_recap_projects_subtitle_preset_check
  check (subtitle_preset in ('yellow', 'white'));
