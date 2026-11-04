-- Saved Prompt Lab versions: the edited system-prompt blocks only, keyed by
-- block, so one version can be applied to any chapter of any story. Applying a
-- version swaps those blocks into that chapter's own freshly built prompt; every
-- other block (and the chapter-specific user message) stays as the chapter's.
create table prompt_lab_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pass text not null check (pass in ('storyboard', 'extract_assets')),
  name text not null check (length(trim(name)) > 0),
  overrides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, pass, name)
);

alter table prompt_lab_versions enable row level security;

create policy "prompt_lab_versions_all_own" on prompt_lab_versions for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table prompt_lab_runs add column version_id uuid references prompt_lab_versions(id) on delete set null;
