-- Auto mode's recap length as a share of the source; null means the
-- length-based recommendation. See history/movie-recap.md.
alter table movie_recap_projects
  add column recap_share numeric check (recap_share is null or (recap_share >= 0.03 and recap_share <= 0.6));
