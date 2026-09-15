-- Copyright-free transformation is now always applied to every project rather
-- than being an optional per-project choice, so the toggle and its column are
-- removed rather than kept as a dead, always-true field.
alter table movie_recap_projects drop column copyright_free;
