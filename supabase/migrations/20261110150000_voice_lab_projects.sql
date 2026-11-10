create table voice_lab_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  voice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index voice_lab_projects_owner_created_idx on voice_lab_projects (owner_id, created_at desc);

alter table voice_lab_projects enable row level security;

create policy voice_lab_projects_own on voice_lab_projects for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy voice_lab_projects_feature_gate on voice_lab_projects as restrictive for all
  using (has_feature('voice_lab')) with check (has_feature('voice_lab'));

alter table voice_lab_items add column project_id uuid references voice_lab_projects(id) on delete cascade;

insert into voice_lab_projects (owner_id, name)
select distinct owner_id, 'Untitled' from voice_lab_items;

update voice_lab_items i
set project_id = p.id
from voice_lab_projects p
where p.owner_id = i.owner_id and i.project_id is null;

alter table voice_lab_items alter column project_id set not null;

drop index if exists voice_lab_items_owner_position_idx;
create index voice_lab_items_project_position_idx on voice_lab_items (project_id, position);

-- An item may only belong to a project of the same owner.
drop policy voice_lab_items_insert_own on voice_lab_items;
drop policy voice_lab_items_update_own on voice_lab_items;
create policy voice_lab_items_insert_own on voice_lab_items for insert
  with check (owner_id = auth.uid() and exists (
    select 1 from voice_lab_projects p where p.id = project_id and p.owner_id = auth.uid()
  ));
create policy voice_lab_items_update_own on voice_lab_items for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (
    select 1 from voice_lab_projects p where p.id = project_id and p.owner_id = auth.uid()
  ));
