-- Anonymous narration is stored separately from shots because one Voice Over
-- block can span several visual clips. Text is snapshotted at storyboard
-- generation; edits use an override so the script version remains restorable,
-- matching shot prompt overrides.
create table voice_over_segments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  source_index int not null check (source_index > 0),
  text text not null check (length(trim(text)) > 0),
  text_override text check (text_override is null or length(trim(text_override)) > 0),
  start_shot_id uuid not null references shots(id) on delete cascade,
  end_shot_id uuid not null references shots(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, source_index)
);

create index voice_over_segments_chapter_id_idx on voice_over_segments(chapter_id);

alter table voice_over_segments enable row level security;

create policy "voice_over_segments_all_own" on voice_over_segments for all
  using (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = voice_over_segments.chapter_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = voice_over_segments.chapter_id and s.owner_id = auth.uid()
  ));
