-- Split each visual style's single `description` into three purpose-specific
-- fields — the same text was being reused for storyboard shots, character
-- reference sheets, AND location reference sheets, which is why
-- character-only language (e.g. "Characters ignore the camera") was leaking
-- into location generations. `description` becomes `scene_description`
-- (storyboard shots, which mix character + environment); two new columns
-- carry the character- and location-specific text.
alter table visual_styles rename column description to scene_description;
alter table visual_styles add column character_description text;
alter table visual_styles add column location_description text;

-- The "3D Animation" built-in style (lib/constants/visual-styles.ts,
-- referenced by stories.visual_style_id = '3d-animation') is being removed —
-- visual styles are now fully user-owned/editable, no more code-locked
-- built-in. Backfill: give every owner who has a story on '3d-animation' a
-- real per-user visual_styles row with the same (now split) content, then
-- repoint those stories at it.
do $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select distinct owner_id from stories where visual_style_id = '3d-animation' and owner_id is not null
  loop
    insert into visual_styles (owner_id, name, swatch, scene_description, character_description, location_description)
    values (
      r.owner_id,
      '3D Animation',
      '#7ea8d8',
      'Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. Characters ignore the camera. Uncropped full frame, textless, no letterboxing.',
      'Vibrant, premium cinematic 3D animation. Volumetric lighting, subsurface scattering, rich tactile textures. Exaggerated, highly expressive character designs with prominent facial features and vivid emotional depth. Characters ignore the camera. Uncropped full frame, textless, no letterboxing.',
      'Premium stylized cinematic 3D animated-film environment. Clearly stylized rather than photorealistic: simplified appealing geometry, gently exaggerated proportions, clean rounded forms, handcrafted material detail, warm expressive lighting, soft global illumination, controlled tactile textures, and polished family-animation-film rendering. Avoid photorealistic architectural visualization, documentary realism, and physically harsh surface detail. Uncropped full frame, textless, no letterboxing.'
    )
    returning id into new_id;

    update stories set visual_style_id = new_id::text where owner_id = r.owner_id and visual_style_id = '3d-animation';
  end loop;
end $$;
