-- Hook titles are removed from the product. They were added on 2026-09-17 to
-- replace the dropped thumbnail columns; in use they were not worth the GPT call
-- at the end of every render, and nothing downstream consumed them.
--
-- This drops the generated options and the user's pick together. There is no
-- way back to either: regenerating was already "render again", and the render
-- no longer writes them at all.
alter table movie_recap_projects
  drop column if exists hook_titles,
  drop column if exists hook_title;
