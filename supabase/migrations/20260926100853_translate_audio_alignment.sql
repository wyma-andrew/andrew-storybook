alter table translate_projects
  add column subtitle_cues jsonb
  check (subtitle_cues is null or jsonb_typeof(subtitle_cues) = 'array');
