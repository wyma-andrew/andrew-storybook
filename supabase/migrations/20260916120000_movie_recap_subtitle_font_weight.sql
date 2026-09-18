-- Bold was a boolean; the reference look needs a third, heavier step, so the
-- switch becomes a three-way weight (400 / 700 / 900). Existing projects keep
-- what they had: bold -> 700, not bold -> 400.
alter table movie_recap_projects
  add column subtitle_font_weight integer not null default 700
    check (subtitle_font_weight in (400, 700, 900));

update movie_recap_projects
  set subtitle_font_weight = case when subtitle_bold then 700 else 400 end;

alter table movie_recap_projects
  drop column subtitle_bold;
