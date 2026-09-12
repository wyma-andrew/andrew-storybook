-- Per-shot framing scale. It selects a predefined optics line (depth of field,
-- background treatment) that the app composes into the copied prompt, the same
-- way motion_mode selects a motion paragraph — a story-wide visual style cannot
-- carry this, because a close-up and an establishing wide need opposite depth
-- of field. Nullable: shots generated before this column fall back to the
-- neutral default and copy as they did before.
alter table shots add column shot_scale text;
