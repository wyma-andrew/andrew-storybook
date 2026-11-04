-- Motion preset text edited in the Prompt Lab, saved with the version it belongs
-- to. Shape: { "<motion style id>": { "<mode>": "<text>" } }. Empty means none.
alter table prompt_lab_versions add column motion_overrides jsonb not null default '{}'::jsonb;
