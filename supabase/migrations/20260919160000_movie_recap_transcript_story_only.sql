-- Whether the last transcript run only redid the Burmese retelling. The progress
-- stepper reads it so a "Retell" run shows the source and dialogue steps as
-- skipped rather than claiming work it never did.
alter table movie_recap_projects
  add column transcript_story_only boolean not null default false;
