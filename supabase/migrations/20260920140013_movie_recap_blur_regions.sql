-- One blur box is not enough: a source can carry a channel logo, a watermark and
-- a burned-in subtitle all at once, and each needs its own rectangle.
--
-- The old single-region columns (blur_enabled, blur_x/y/width/height) stay where
-- they are and stop being read. Dropping them is a separate decision — the rows
-- still hold what people set, and this migration copies it forward.
alter table movie_recap_projects
  add column if not exists blur_regions jsonb not null default '[]'::jsonb;

update movie_recap_projects
set blur_regions = jsonb_build_array(
  jsonb_build_object('x', blur_x, 'y', blur_y, 'width', blur_width, 'height', blur_height)
)
where blur_enabled and blur_regions = '[]'::jsonb;
