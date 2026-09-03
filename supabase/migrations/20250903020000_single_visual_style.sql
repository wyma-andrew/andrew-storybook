-- Trim the global visual style library down to a single option for now:
-- 3D Animation. Reassign any story currently on an old built-in style to it
-- first (FK-safe), then remove the old built-ins.

insert into visual_styles (scope, name, description, swatch, source)
values (
  'global',
  '3D Animation',
  'Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. Characters ignore the camera. Uncropped full frame, textless, no letterboxing.',
  '#7ea8d8',
  'built_in'
);

update stories
set visual_style_id = (select id from visual_styles where name = '3D Animation' and scope = 'global')
where visual_style_id in (
  select id from visual_styles where scope = 'global' and source = 'built_in' and name <> '3D Animation'
);

delete from visual_styles
where scope = 'global' and source = 'built_in' and name <> '3D Animation';
