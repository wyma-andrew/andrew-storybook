create table recap_v2_projects (
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
  units jsonb not null default '[]'::jsonb,
  story_context jsonb,
  voice_id text not null default 'azure-thiha',
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9', '9:16', '1:1')),
  fit_mode text not null default 'contain' check (fit_mode in ('contain', 'cover')),
  zoom double precision not null default 1.05 check (zoom between 1 and 1.5),
  mirror boolean not null default true,
  subtitles_enabled boolean not null default true,
  subtitle_y double precision not null default 90 check (subtitle_y between 5 and 98),
  subtitle_size double precision not null default 3.4 check (subtitle_size between 1 and 10),
  blur_regions jsonb not null default '[]'::jsonb,
  job_kind text check (job_kind in ('transcribe', 'translate', 'render')),
  job_status text not null default 'idle' check (job_status in ('idle', 'running', 'done', 'failed')),
  job_stage text,
  job_progress double precision,
  job_error text,
  render_output_key text,
  render_output_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recap_v2_source_ready check (
    source_upload_status <> 'ready' or (source_url is not null and source_upload_id is null)
  )
);

create index recap_v2_projects_owner_created_idx on recap_v2_projects (owner_id, created_at desc);

alter table recap_v2_projects enable row level security;

create policy recap_v2_projects_select_own on recap_v2_projects for select
  using (owner_id = auth.uid());
create policy recap_v2_projects_insert_own on recap_v2_projects for insert
  with check (owner_id = auth.uid());
create policy recap_v2_projects_update_own on recap_v2_projects for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy recap_v2_projects_delete_own on recap_v2_projects for delete
  using (owner_id = auth.uid());

create policy recap_v2_projects_feature_gate on recap_v2_projects as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
