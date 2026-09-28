alter table public.movie_recap_projects
  drop constraint if exists movie_recap_projects_voice_profile_id_check;

alter table public.movie_recap_projects
  add constraint movie_recap_projects_voice_profile_id_check
  check (voice_profile_id in ('azure-thiha', 'azure-nilar', 'narrator', 'narrator-female'));
