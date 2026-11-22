-- Recap V2's logo now works like Movie Recap's: a saved template or one-off
-- file, a corner placement, opacity 0–100, and an optional watermark text.
-- Title and Extra text are removed. See history/recap-v2.md.
alter table recap_v2_projects
  drop column title_text,
  drop column title_size,
  drop column title_x,
  drop column title_y,
  drop column extra_text,
  drop column extra_size,
  drop column extra_x,
  drop column extra_y,
  drop column logo_size,
  drop column logo_x,
  drop column logo_y,
  add column logo_enabled boolean not null default false,
  add column logo_placement text not null default 'top_right'
    check (logo_placement in ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  add column logo_watermark_text text check (char_length(logo_watermark_text) <= 120),
  add column logo_template_id uuid references movie_recap_logo_templates(id) on delete set null;

alter table recap_v2_projects drop constraint if exists recap_v2_projects_logo_opacity_check;
alter table recap_v2_projects alter column logo_opacity set default 100;
update recap_v2_projects set logo_opacity = round(logo_opacity * 100);
alter table recap_v2_projects add constraint recap_v2_projects_logo_opacity_check check (logo_opacity between 0 and 100);

update recap_v2_projects set logo_enabled = true where logo_object_key is not null;
