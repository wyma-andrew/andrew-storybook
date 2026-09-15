alter table movie_recap_projects
  add column subtitle_font_size numeric not null default 4.5,
  add column subtitle_color text not null default '#FFFFFF',
  add column subtitle_bg_color text not null default '#000000',
  add column subtitle_bg_opacity integer not null default 70,
  add column subtitle_position text not null default 'bottom' check (subtitle_position in ('bottom', 'middle', 'top')),
  add column subtitle_offset numeric not null default 8,
  add column subtitle_bold boolean not null default true,
  add column render_is_mock boolean not null default false;
