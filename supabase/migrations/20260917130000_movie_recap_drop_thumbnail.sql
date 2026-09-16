-- Supersedes 20260917120000_movie_recap_thumbnail: the source-frame thumbnail
-- was replaced by generated hook titles before it shipped to anyone, so the
-- columns carry no data worth keeping. See history/movie-recap.md.
--
-- The forward migration is dropped rather than edited in place because it was
-- already pushed to the remote; the schema has to be walked back, not pretended
-- away.
alter table public.movie_recap_projects
  drop column if exists thumbnail_url,
  drop column if exists thumbnail_object_key,
  drop column if exists thumbnail_at_seconds,
  drop column if exists thumbnail_attempt;
