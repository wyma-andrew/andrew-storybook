-- Scene-level lighting and atmosphere: time of day, where the light comes from
-- (tied to the location's layout anchors), and the mood it creates. Nothing in
-- the pipeline carried this before — location reference prompts deliberately
-- exclude lighting, shot prompts exclude lighting rigs, and the visual style
-- describes a global look, not a scene's hour. Without it each shot's light was
-- whatever the image model guessed, so one scene could cut from noon to dusk.
-- Scene-level, not per shot: shots inside one scene share an hour, or the cut
-- flickers. Injected at copy time, never stored inside a shot prompt, so it can
-- be re-edited without regenerating shots.
alter table scenes add column lighting text;
