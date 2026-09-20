-- The wizard gains a Transcript step between Add Source and Project Settings,
-- so every step after Add Source shifts up one.
alter table movie_recap_projects
  drop constraint movie_recap_projects_current_step_check;

update movie_recap_projects set current_step = current_step + 1 where current_step >= 2;

alter table movie_recap_projects
  add constraint movie_recap_projects_current_step_check check (current_step between 1 and 5);

-- The source's dialogue, read once at step 2 instead of inside every render:
-- `transcript` is the original wording, `transcript_mm` its Burmese translation
-- (one entry per line, same order), and `transcript_source` says whether the
-- lines came from the file's own subtitle track or from Whisper.
alter table movie_recap_projects
  add column transcript jsonb,
  add column transcript_mm jsonb,
  add column transcript_source text check (transcript_source in ('captions', 'whisper')),
  add column transcript_status text not null default 'idle'
    check (transcript_status in ('idle', 'running', 'done', 'failed')),
  add column transcript_stage text,
  add column transcript_progress_current integer,
  add column transcript_progress_total integer,
  add column transcript_error text;
