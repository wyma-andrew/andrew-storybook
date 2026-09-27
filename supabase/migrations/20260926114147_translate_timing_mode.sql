alter table translate_projects
  add column subtitle_timing_mode text not null default 'original'
  check (subtitle_timing_mode in ('original', 'aligned'));

update translate_projects
set subtitle_timing_mode = 'aligned'
where subtitle_cues is not null;

alter table translate_projects
  add constraint translate_aligned_timing_requires_cues
  check (subtitle_timing_mode <> 'aligned' or subtitle_cues is not null);
