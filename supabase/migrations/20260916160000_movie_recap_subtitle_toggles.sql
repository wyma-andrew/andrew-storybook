-- Shadow and heavy weight are both opt-in extras, so each gets an explicit
-- on/off switch like logo and blur already have, instead of being "off" by
-- meaning a magic value (0% / weight 400) inside its own control.
alter table movie_recap_projects
  add column subtitle_shadow_enabled boolean not null default false,
  add column subtitle_font_weight_enabled boolean not null default false;

-- Keep what projects already render: a non-zero shadow or a non-regular weight
-- was already in effect, so those switches start on.
update movie_recap_projects
  set subtitle_shadow_enabled = subtitle_shadow > 0,
      subtitle_font_weight_enabled = subtitle_font_weight <> 400;

-- With the switch carrying "off", the value columns only ever hold the look
-- used when the switch is on: a shadow that is actually visible, and a weight
-- heavier than regular.
alter table movie_recap_projects
  alter column subtitle_shadow set default 6,
  alter column subtitle_font_weight set default 700;

update movie_recap_projects set subtitle_shadow = 6 where subtitle_shadow = 0;
update movie_recap_projects set subtitle_font_weight = 700 where subtitle_font_weight = 400;

alter table movie_recap_projects
  drop constraint if exists movie_recap_projects_subtitle_shadow_check,
  add constraint movie_recap_projects_subtitle_shadow_check
    check (subtitle_shadow >= 1 and subtitle_shadow <= 20),
  drop constraint if exists movie_recap_projects_subtitle_font_weight_check,
  add constraint movie_recap_projects_subtitle_font_weight_check
    check (subtitle_font_weight in (700, 900));
