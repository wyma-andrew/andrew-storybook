alter table translate_projects
  add column cover_object_key text unique,
  add column cover_url text,
  add constraint translate_projects_cover_complete check (
    (cover_object_key is null and cover_url is null)
    or (cover_object_key is not null and cover_url is not null)
  );
