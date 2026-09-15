-- Text shadow option removed the same day it was added; not wanted.
alter table movie_recap_projects
  drop column subtitle_shadow;
