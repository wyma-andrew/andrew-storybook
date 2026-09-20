-- The transcript and its Burmese retelling are entered by hand for now, so the
-- source side needs somewhere to live that is not the timed segment array the
-- read pipeline produces. Pasted text has no timestamps.
alter table movie_recap_projects
  add column transcript_text text;
