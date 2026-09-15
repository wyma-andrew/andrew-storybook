-- The step-3 preview was rendering subtitles at ~2x their configured size (see
-- history/movie-recap.md), so the size people picked while looking at it was
-- really about half what they thought. Now that the preview is truthful, the
-- old 6% default reads small; 10% matches the look that was being approved.
alter table movie_recap_projects
  alter column subtitle_font_size set default 10;

update movie_recap_projects
  set subtitle_font_size = 10
  where subtitle_font_size in (4.5, 6);
