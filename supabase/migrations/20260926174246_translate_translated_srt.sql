alter table translate_projects
  add column translated_srt_file_name text,
  add column translated_srt_text text;

alter table translate_projects
  drop constraint translate_projects_subtitle_timing_mode_check;

alter table translate_projects
  add constraint translate_projects_subtitle_timing_mode_check
  check (subtitle_timing_mode in ('original', 'aligned', 'translated'));

alter table translate_projects
  add constraint translate_translated_timing_requires_srt
  check (subtitle_timing_mode <> 'translated' or translated_srt_text is not null);
