-- Prompt Lab shows a prompt as the ordered blocks it is built from. A run keeps
-- the blocks it was sent with ([{key, label, source, text}]), so "Load prompts"
-- restores them block by block. Their joined texts equal system_prompt /
-- user_prompt; runs from before this column have none and load as one block.
alter table prompt_lab_runs add column system_parts jsonb;
alter table prompt_lab_runs add column user_parts jsonb;
