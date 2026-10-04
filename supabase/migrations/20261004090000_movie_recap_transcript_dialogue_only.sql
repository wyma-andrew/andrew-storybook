-- Whether the last transcript run read speech only (Recap Video's Audio mode),
-- so the stepper shows Scenes as skipped and a reload keeps the Recap Video tab.
alter table movie_recap_projects
  add column transcript_dialogue_only boolean not null default false;
