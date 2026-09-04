-- Rewrites the default location preset from a single establishing framing to
-- a location reference sheet framing (fixed angles + locked lighting/color/
-- time-of-day), matching the character turnaround-sheet approach.
update system_prompts
set prompt = 'Location reference sheet: wide establishing view plus 2-3 fixed camera angles of the same space (e.g. entry view, opposite-corner view). Identical architecture, furniture and prop placement, wall colors/materials, and light source direction across every view and every future generation. Lock time of day and color palette. No characters present unless specified.'
where kind = 'location';
