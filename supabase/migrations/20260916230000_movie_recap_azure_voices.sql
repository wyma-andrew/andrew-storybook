-- Movie Recap narration moves to Azure Speech's Burmese neural voices. The old
-- `narrator` value named the self-hosted VoxCPM2 profile, which stays available
-- in the Voice Lab but is no longer offered for a recap render, so existing
-- rows are moved to the male Azure voice rather than left pointing at a profile
-- the Settings tab no longer lists.
alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_voice_profile_id_check;

update movie_recap_projects
  set voice_profile_id = 'azure-thiha'
  where voice_profile_id not in ('azure-thiha', 'azure-nilar');

alter table movie_recap_projects
  alter column voice_profile_id set default 'azure-thiha';

alter table movie_recap_projects
  add constraint movie_recap_projects_voice_profile_id_check
  check (voice_profile_id in ('azure-thiha', 'azure-nilar'));
