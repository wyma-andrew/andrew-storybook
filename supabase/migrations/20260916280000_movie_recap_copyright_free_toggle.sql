-- Copyright-free transformation becomes a per-project choice again, reversing
-- 20260915134938_movie_recap_drop_copyright_free.sql. That migration removed the
-- column on the grounds that the transform must always run; the product decision
-- is now that the user chooses.
--
-- Default TRUE, unlike the original column's FALSE: every project that exists
-- today was created under the "always transform" rule, so true is what they were
-- promised, and it is the safer default for a new one.
alter table movie_recap_projects
  add column copyright_free boolean not null default true;
