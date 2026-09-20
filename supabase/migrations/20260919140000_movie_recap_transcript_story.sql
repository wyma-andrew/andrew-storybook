-- The Burmese side is one flowing retelling of the whole transcript, not a line
-- for every source line, so it stops being an array of timed segments.
alter table movie_recap_projects
  drop column transcript_mm,
  add column transcript_story text;
