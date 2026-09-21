alter table movie_recap_projects
  add column logo_template_id uuid references movie_recap_logo_templates(id) on delete set null;

create index movie_recap_projects_logo_template_idx
  on movie_recap_projects (logo_template_id);
