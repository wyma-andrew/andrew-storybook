-- Rewrites the default character preset from a single portrait framing to a
-- turnaround/character-sheet framing, which gives external image tools a
-- much stronger multi-angle identity anchor for downstream consistency.
update system_prompts
set prompt = 'Character reference sheet: full-body turnaround, front view / 3-quarter view / side view / back view, neutral standing pose, arranged left to right, consistent scale and studio lighting across all views, plain neutral background, no props or background elements. Maintain exact facial structure, hairstyle, and wardrobe identically across every view and every future generation of this character.'
where kind = 'character';
