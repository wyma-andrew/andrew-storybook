-- `copyright_zoom` could not tell "no zoom, deliberately" from "never chosen":
-- both were 1, so a project that arrived with the transform already on sat at 1
-- until its fit mode was touched. NULL now means "not chosen" — the UI shows the
-- recommendation for the fit mode and the render uses it — and 1 is a real
-- choice again.
alter table movie_recap_projects
  alter column copyright_zoom drop not null,
  alter column copyright_zoom set default null;

-- Existing rows all carry the column default rather than a decision, so they go
-- back to unset and pick up the recommendation.
update movie_recap_projects
  set copyright_zoom = null
  where copyright_zoom = 1;
