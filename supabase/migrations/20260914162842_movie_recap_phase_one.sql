-- Phase one of Movie Recap stores one uploaded source plus the configuration
-- needed by the later generation pipeline. Source/logo bytes live in R2; this
-- table stores their stable public URLs and the in-progress multipart upload id.
create table movie_recap_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  output_language text not null default 'my' check (output_language in ('my')),
  voice_profile_id text not null default 'narrator' check (voice_profile_id in ('narrator')),

  source_file_name text not null,
  source_object_key text not null unique,
  source_url text,
  source_content_type text not null,
  source_size_bytes bigint not null check (source_size_bytes > 0),
  source_duration_seconds double precision not null check (source_duration_seconds > 0),
  source_last_modified bigint not null,
  source_upload_id text,
  source_upload_status text not null default 'pending'
    check (source_upload_status in ('pending', 'uploading', 'ready', 'failed')),

  aspect_ratio text not null default '16:9' check (aspect_ratio in ('9:16', '16:9')),
  subtitle_mode text not null default 'none' check (subtitle_mode in ('none', 'srt', 'styled')),

  logo_enabled boolean not null default false,
  logo_file_name text,
  logo_object_key text unique,
  logo_url text,
  logo_content_type text,
  logo_size_bytes bigint check (logo_size_bytes is null or logo_size_bytes > 0),
  logo_placement text not null default 'top_left'
    check (logo_placement in ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  logo_opacity smallint not null default 100 check (logo_opacity between 0 and 100),

  blur_enabled boolean not null default false,
  blur_x double precision not null default 35 check (blur_x between 0 and 100),
  blur_y double precision not null default 40 check (blur_y between 0 and 100),
  blur_width double precision not null default 30 check (blur_width between 5 and 100),
  blur_height double precision not null default 20 check (blur_height between 5 and 100),

  copyright_free boolean not null default false,
  current_step smallint not null default 1 check (current_step between 1 and 4),
  status text not null default 'draft' check (status in ('draft', 'ready_for_generation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint movie_recap_blur_inside_frame check (
    blur_x + blur_width <= 100 and blur_y + blur_height <= 100
  ),
  constraint movie_recap_ready_source check (
    source_upload_status <> 'ready' or (source_url is not null and source_upload_id is null)
  ),
  constraint movie_recap_logo_complete check (
    (logo_file_name is null and logo_object_key is null and logo_url is null and logo_content_type is null and logo_size_bytes is null)
    or
    (logo_file_name is not null and logo_object_key is not null and logo_url is not null and logo_content_type is not null and logo_size_bytes is not null)
  )
);

create index movie_recap_projects_owner_updated_idx
  on movie_recap_projects (owner_id, updated_at desc);

alter table movie_recap_projects enable row level security;

create policy "movie_recap_projects_select_own" on movie_recap_projects for select
  using (owner_id = auth.uid());
create policy "movie_recap_projects_insert_own" on movie_recap_projects for insert
  with check (owner_id = auth.uid());
create policy "movie_recap_projects_update_own" on movie_recap_projects for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "movie_recap_projects_delete_own" on movie_recap_projects for delete
  using (owner_id = auth.uid());
