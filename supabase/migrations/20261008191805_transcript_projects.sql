create table transcript_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_file_name text not null,
  source_object_key text not null unique,
  source_url text,
  source_content_type text not null,
  source_size_bytes bigint not null check (source_size_bytes > 0),
  source_duration_seconds double precision not null check (source_duration_seconds > 0),
  source_last_modified bigint not null,
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  source_upload_id text,
  source_upload_status text not null default 'pending'
    check (source_upload_status in ('pending', 'uploading', 'ready', 'failed')),
  cover_object_key text,
  cover_url text,
  transcript_text text,
  job_status text not null default 'idle' check (job_status in ('idle', 'running', 'done', 'failed')),
  job_stage text,
  job_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transcript_source_ready check (
    source_upload_status <> 'ready' or (source_url is not null and source_upload_id is null)
  )
);

create index transcript_projects_owner_created_idx on transcript_projects (owner_id, created_at desc);

alter table transcript_projects enable row level security;

create policy transcript_projects_select_own on transcript_projects for select
  using (owner_id = auth.uid());
create policy transcript_projects_insert_own on transcript_projects for insert
  with check (owner_id = auth.uid());
create policy transcript_projects_update_own on transcript_projects for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy transcript_projects_delete_own on transcript_projects for delete
  using (owner_id = auth.uid());

create policy transcript_projects_feature_gate on transcript_projects as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
