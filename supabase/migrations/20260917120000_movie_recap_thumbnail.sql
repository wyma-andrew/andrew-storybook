-- A thumbnail grabbed from the UPLOADED source, not from the render output.
-- The source is ready at step one, so the Review tab can show cover art long
-- before any render exists -- and a render costs minutes of CPU plus API spend,
-- which is far too much to pay for a picture.
--
-- `thumbnail_attempt` is the shuffle position, not a counter of successes: the
-- button re-grabs at the next position in a fixed sequence, so the frame a press
-- produces is reproducible and pressing again never repeats the same frame.
alter table public.movie_recap_projects
  add column thumbnail_url text,
  add column thumbnail_object_key text,
  add column thumbnail_at_seconds double precision
    check (thumbnail_at_seconds is null or thumbnail_at_seconds >= 0),
  add column thumbnail_attempt integer not null default 0
    check (thumbnail_attempt >= 0);
