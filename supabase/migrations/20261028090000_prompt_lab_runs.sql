-- Prompt Lab experiment runs. A sandbox beside the storyboard: a run never
-- writes scenes or shots, so it can be compared against the real storyboard and
-- against other runs. The prompts are stored as sent, because the point of a
-- run is that its system prompt may differ from the code constant.
create table prompt_lab_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  pass text not null check (pass in ('storyboard')),
  label text,
  model text not null,
  reasoning_effort text,
  system_prompt text not null,
  user_prompt text not null,
  system_prompt_edited boolean not null default false,
  user_prompt_edited boolean not null default false,
  context jsonb not null default '{}'::jsonb,
  raw_output text,
  output jsonb,
  error text,
  usage jsonb,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index prompt_lab_runs_chapter_id_idx on prompt_lab_runs(chapter_id, created_at desc);

alter table prompt_lab_runs enable row level security;

create policy "prompt_lab_runs_all_own" on prompt_lab_runs for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from chapters c join stories s on s.id = c.story_id
      where c.id = prompt_lab_runs.chapter_id and s.owner_id = auth.uid()
    )
  );
