-- Subtitle text was readable in the step-3 preview but small in the exported
-- video; 4.5% of frame height is broadcast-caption size, below what recap /
-- social video normally uses. Raise the default and lift rows still sitting on
-- the old default (nobody has deliberately chosen 4.5 yet).
alter table movie_recap_projects
  alter column subtitle_font_size set default 6;

update movie_recap_projects
  set subtitle_font_size = 6
  where subtitle_font_size = 4.5;
