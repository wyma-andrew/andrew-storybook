-- The voice catalog in lib/tts/voices.ts is the only list of voices; the API
-- validates voice_profile_id against it (history/voice-lab.md 2026-11-11).
alter table public.movie_recap_projects
  drop constraint if exists movie_recap_projects_voice_profile_id_check;
