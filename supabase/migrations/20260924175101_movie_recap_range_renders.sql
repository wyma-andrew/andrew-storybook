create table movie_recap_range_renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references movie_recap_projects(id) on delete cascade,
  start_beat integer not null check (start_beat > 0),
  end_beat integer not null check (end_beat >= start_beat),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text,
  output_object_key text unique,
  output_url text,
  duration_seconds double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movie_recap_range_render_output check (
    status <> 'done' or (output_object_key is not null and output_url is not null and duration_seconds is not null)
  )
);

create index movie_recap_range_renders_project_created_idx
  on movie_recap_range_renders(project_id, created_at desc);

create unique index movie_recap_range_renders_one_running_idx
  on movie_recap_range_renders(project_id) where status = 'running';

alter table movie_recap_range_renders enable row level security;

create policy "movie_recap_range_renders_own" on movie_recap_range_renders for all
  using (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ));

create policy "movie_recap_range_renders_feature_gate" on movie_recap_range_renders
  as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
