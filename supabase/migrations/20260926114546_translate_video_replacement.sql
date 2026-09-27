alter table translate_projects
  add column source_replacement jsonb
  check (source_replacement is null or jsonb_typeof(source_replacement) = 'object');
