-- How far through the passage currently being retold, 0-100. The passage count
-- alone left the bar sitting at 0% for minutes: a long source is only two or
-- three passages, so nothing moved until a whole one finished.
alter table movie_recap_projects
  add column transcript_progress_partial smallint;
