-- Preview-only fit mode for the aspect ratio frame: "cover" crops the video to
-- fill the frame (previous default behavior), "contain" letterboxes it so the
-- full video stays visible. Still a normalized configuration value, not a
-- render decision -- actual output cropping/letterboxing remains phase two.
alter table movie_recap_projects
  add column fit_mode text not null default 'cover' check (fit_mode in ('cover', 'contain'));
