create table translate_projects (
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
  srt_file_name text,
  srt_text text,
  blur_regions jsonb not null default '[{"x":8,"y":75,"width":84,"height":18}]'::jsonb,
  subtitle_x double precision not null default 50 check (subtitle_x between 5 and 95),
  subtitle_y double precision not null default 92 check (subtitle_y between 5 and 98),
  subtitle_size double precision not null default 4 check (subtitle_size between 1 and 10),
  render_status text not null default 'idle' check (render_status in ('idle', 'running', 'done', 'failed')),
  render_error text,
  render_output_key text,
  render_output_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translate_source_ready check (
    source_upload_status <> 'ready' or (source_url is not null and source_upload_id is null)
  ),
  constraint translate_srt_pair check ((srt_file_name is null) = (srt_text is null))
);

create index translate_projects_owner_updated_idx on translate_projects (owner_id, updated_at desc);

alter table translate_projects enable row level security;

create policy translate_projects_select_own on translate_projects for select
  using (owner_id = auth.uid());
create policy translate_projects_insert_own on translate_projects for insert
  with check (owner_id = auth.uid());
create policy translate_projects_update_own on translate_projects for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy translate_projects_delete_own on translate_projects for delete
  using (owner_id = auth.uid());

create policy translate_projects_feature_gate on translate_projects as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
