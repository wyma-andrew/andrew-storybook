-- Chapter-level geography snapshot, written by the storyboard generation pass.
-- It holds what no asset row does: which [SCENE] heading plays in which
-- location asset, and how the locations connect (the anchor a move passes
-- through, and the screen direction of that move). Single-scene regeneration
-- reads it back so a re-shot scene keeps the chapter's geography instead of
-- re-deriving it from one scene's slice of the script.
-- Nullable: chapters storyboarded before this column, and any pass where the
-- model returns nothing usable, simply have no map.
alter table chapters add column site_map jsonb;
