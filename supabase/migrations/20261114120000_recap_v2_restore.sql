-- Recap V2 returns (history/recap-v2.md, 2026-11-14), with the settings the
-- recap-en-to-mm tool gained since the first port, and its Splitter tool.

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
  source_language text not null default 'auto',
  detected_language text,
  cover_object_key text,
  cover_url text,
  units jsonb not null default '[]'::jsonb,
  story_context jsonb,
  voice_id text not null default 'azure-thiha',
  voice_volume integer not null default 100 check (voice_volume between 50 and 300),
  short_pauses boolean not null default true,
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9', '9:16', '1:1', 'original')),
  fit_mode text not null default 'blur' check (fit_mode in ('blur', 'bars', 'cover')),
  quality text not null default '1080' check (quality in ('1080', '720', '480')),
  zoom double precision not null default 1.05 check (zoom between 1 and 1.5),
  mirror boolean not null default true,
  subtitles_enabled boolean not null default true,
  subtitle_y double precision not null default 90 check (subtitle_y between 5 and 98),
  subtitle_size double precision not null default 3.4 check (subtitle_size between 1 and 10),
  blur_regions jsonb not null default '[]'::jsonb,
  title_text text not null default '',
  title_size double precision not null default 6 check (title_size between 1 and 20),
  title_x double precision not null default 50 check (title_x between 0 and 100),
  title_y double precision not null default 8 check (title_y between 0 and 100),
  extra_text text not null default '',
  extra_size double precision not null default 4 check (extra_size between 1 and 20),
  extra_x double precision not null default 50 check (extra_x between 0 and 100),
  extra_y double precision not null default 18 check (extra_y between 0 and 100),
  logo_object_key text,
  logo_url text,
  logo_size double precision not null default 12 check (logo_size between 2 and 50),
  logo_opacity double precision not null default 1 check (logo_opacity between 0.1 and 1),
  logo_x double precision not null default 90 check (logo_x between 0 and 100),
  logo_y double precision not null default 10 check (logo_y between 0 and 100),
  job_kind text check (job_kind in ('transcribe', 'translate', 'render')),
  job_status text not null default 'idle' check (job_status in ('idle', 'running', 'done', 'failed')),
  job_stage text,
  job_progress double precision,
  job_error text,
  render_output_key text,
  render_output_url text,
  render_srt_key text,
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

create table splitter_projects (
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
  part_minutes double precision not null default 3 check (part_minutes between 0.5 and 60),
  smart_cut boolean not null default true,
  smart_cut_seconds double precision not null default 20 check (smart_cut_seconds between 1 and 120),
  aspect_ratio text not null default 'original' check (aspect_ratio in ('16:9', '9:16', '1:1', 'original')),
  fit_mode text not null default 'blur' check (fit_mode in ('blur', 'bars', 'cover')),
  quality text not null default '1080' check (quality in ('1080', '720', '480')),
  text_value text not null default '',
  text_size double precision not null default 5 check (text_size between 1 and 20),
  text_opacity double precision not null default 1 check (text_opacity between 0.1 and 1),
  text_box boolean not null default false,
  text_x double precision not null default 50 check (text_x between 0 and 100),
  text_y double precision not null default 10 check (text_y between 0 and 100),
  part_number_enabled boolean not null default true,
  part_number_template text not null default 'Part {n}/{total}',
  part_number_size double precision not null default 5 check (part_number_size between 1 and 20),
  part_number_x double precision not null default 50 check (part_number_x between 0 and 100),
  part_number_y double precision not null default 90 check (part_number_y between 0 and 100),
  parts jsonb not null default '[]'::jsonb,
  job_status text not null default 'idle' check (job_status in ('idle', 'running', 'done', 'failed')),
  job_stage text,
  job_progress double precision,
  job_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint splitter_source_ready check (
    source_upload_status <> 'ready' or (source_url is not null and source_upload_id is null)
  )
);

create index splitter_projects_owner_created_idx on splitter_projects (owner_id, created_at desc);

alter table splitter_projects enable row level security;

create policy splitter_projects_select_own on splitter_projects for select
  using (owner_id = auth.uid());
create policy splitter_projects_insert_own on splitter_projects for insert
  with check (owner_id = auth.uid());
create policy splitter_projects_update_own on splitter_projects for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy splitter_projects_delete_own on splitter_projects for delete
  using (owner_id = auth.uid());

create policy splitter_projects_feature_gate on splitter_projects as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
