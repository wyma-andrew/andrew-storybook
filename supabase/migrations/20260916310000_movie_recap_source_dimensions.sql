-- The browser already reads the source's dimensions when it reads the duration;
-- storing them lets the render and the UI reason about the footage instead of
-- guessing (whether the output orientation matches the source, whether a zoom
-- will soften a small source).
--
-- Nullable: rows created before this, and any source whose dimensions could not
-- be read, legitimately have none.
alter table movie_recap_projects
  add column source_width integer,
  add column source_height integer;

alter table movie_recap_projects
  add constraint movie_recap_projects_source_dimensions_check
  check (
    (source_width is null and source_height is null)
    or (source_width > 0 and source_height > 0)
  );
