-- Shadow and bold are plain on/off. The size, colour and weight-step columns
-- are dropped: the look they held is now fixed in code (lib/constants).
alter table movie_recap_projects
  drop column subtitle_shadow,
  drop column subtitle_shadow_color,
  drop column subtitle_font_weight;
