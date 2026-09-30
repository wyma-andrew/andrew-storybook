create table voice_lab_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null,
  text text not null check (char_length(text) between 1 and 600),
  voice_id text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  audio_key text,
  audio_url text,
  duration_seconds double precision,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_lab_items_audio_complete check (
    status <> 'done' or (audio_key is not null and audio_url is not null)
  )
);

create index voice_lab_items_owner_position_idx on voice_lab_items (owner_id, position);

alter table voice_lab_items enable row level security;

create policy voice_lab_items_select_own on voice_lab_items for select
  using (owner_id = auth.uid());
create policy voice_lab_items_insert_own on voice_lab_items for insert
  with check (owner_id = auth.uid());
create policy voice_lab_items_update_own on voice_lab_items for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy voice_lab_items_delete_own on voice_lab_items for delete
  using (owner_id = auth.uid());

create policy voice_lab_items_feature_gate on voice_lab_items as restrictive for all
  using (has_feature('voice_lab')) with check (has_feature('voice_lab'));
