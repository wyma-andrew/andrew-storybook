-- Both reference-sheet presets describe composition using label-like phrasing
-- ("entry view", "opposite-corner view", "front view / 3-quarter view / ...") with
-- no instruction against on-image text — image models were rendering that
-- structure as literal captions burned into the image. Add an explicit no-text rule.
update system_prompts
set prompt = 'Character reference sheet: full-body turnaround, front view / 3-quarter view / side view / back view, neutral standing pose, arranged left to right, consistent scale and studio lighting across all views, plain neutral background, no props or background elements. Maintain exact facial structure, hairstyle, and wardrobe identically across every view and every future generation of this character. No text, captions, labels, watermarks, or UI overlays anywhere in the image.'
where kind = 'character';

update system_prompts
set prompt = 'Location reference sheet: wide establishing view plus 2-3 fixed camera angles of the same space (e.g. entry view, opposite-corner view). Identical architecture, furniture and prop placement, wall colors/materials, and light source direction across every view and every future generation. Lock time of day and color palette. No characters present unless specified. No text, captions, labels, watermarks, or UI overlays anywhere in the image.'
where kind = 'location';
