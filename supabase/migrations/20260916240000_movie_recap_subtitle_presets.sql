-- Subtitle look becomes a preset instead of six independent columns. The
-- combinations that stay readable over moving footage are few and known, so the
-- wizard offers those and the render resolves colour, size, weight and shadow
-- from the preset plus the aspect ratio (lib/constants/movie-recap.ts).
--
-- Existing rows keep whichever colour they were already using; everything else
-- those columns held (a hand-set size, a background pill, the bold and shadow
-- switches) has no preset equivalent and is dropped.
alter table movie_recap_projects
  add column subtitle_preset text not null default 'yellow';

update movie_recap_projects
  set subtitle_preset = case when upper(subtitle_color) = '#FFFFFF' then 'white' else 'yellow' end;

alter table movie_recap_projects
  add constraint movie_recap_projects_subtitle_preset_check
  check (subtitle_preset in ('yellow', 'white'));

alter table movie_recap_projects
  drop column subtitle_font_size,
  drop column subtitle_color,
  drop column subtitle_bg_color,
  drop column subtitle_bg_opacity,
  drop column subtitle_bold,
  drop column subtitle_shadow;
