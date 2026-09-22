alter table movie_recap_projects
  add column hook_title text,
  add column hook_title_position text not null default 'bottom'
    check (hook_title_position in ('bottom', 'middle', 'top')),
  add column hook_title_offset numeric not null default 8
    check (hook_title_offset between 0 and 45);
