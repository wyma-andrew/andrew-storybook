alter table public.movie_recap_projects
  add column subtitle_size numeric
  constraint movie_recap_projects_subtitle_size_check
  check (subtitle_size between 1 and 10);
