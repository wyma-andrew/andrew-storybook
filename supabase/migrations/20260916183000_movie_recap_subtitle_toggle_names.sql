-- With the value columns gone the "_enabled" suffix is noise: the boolean IS
-- the setting now.
alter table movie_recap_projects rename column subtitle_font_weight_enabled to subtitle_bold;
alter table movie_recap_projects rename column subtitle_shadow_enabled to subtitle_shadow;
