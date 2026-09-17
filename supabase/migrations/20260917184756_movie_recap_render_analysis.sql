-- Re-rendering from an edited script needs everything the shot planner reads,
-- which the render otherwise throws away with its temp directory: the spare
-- scenes it can borrow from, the source's own cuts, and the motion track.
--
-- The blob lives in R2, not in this column. The motion track alone is one value
-- per 0.25s of source — hundreds of kilobytes for a feature — and the project
-- row is re-read every two seconds while a render runs. Only the key is stored.
alter table movie_recap_projects
  add column render_analysis_key text;

comment on column movie_recap_projects.render_analysis_key is
  'R2 key for the JSON the shot planner needs to re-render without re-analysing the source. Written at the end of a full render; null means only a full render is possible.';
