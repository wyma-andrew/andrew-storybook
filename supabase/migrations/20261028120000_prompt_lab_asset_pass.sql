-- Prompt Lab gains the asset-extraction pass. A storyboard run may take its
-- Known Assets from an extraction run instead of the chapter's assets, so the
-- whole chain can be tested without touching chapter_assets.
alter table prompt_lab_runs drop constraint prompt_lab_runs_pass_check;
alter table prompt_lab_runs add constraint prompt_lab_runs_pass_check check (pass in ('storyboard', 'extract_assets'));
alter table prompt_lab_runs add column asset_run_id uuid references prompt_lab_runs(id) on delete set null;
