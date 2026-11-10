update public.voice_lab_projects
  set voice_id = null
  where voice_id in ('narrator', 'narrator-female');

update public.movie_recap_projects
  set voice_profile_id = 'azure-thiha'
  where voice_profile_id in ('narrator', 'narrator-female');

alter table public.movie_recap_projects
  drop constraint if exists movie_recap_projects_voice_profile_id_check;

alter table public.movie_recap_projects
  add constraint movie_recap_projects_voice_profile_id_check
  check (voice_profile_id in ('azure-thiha', 'azure-nilar'));
