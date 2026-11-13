create table movie_recap_episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references movie_recap_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  start_beat integer not null check (start_beat > 0),
  end_beat integer not null check (end_beat >= start_beat),
  render_script jsonb,
  script_status text not null default 'idle' check (script_status in ('idle', 'running', 'ready', 'failed')),
  script_error text,
  render_status text not null default 'idle' check (render_status in ('idle', 'running', 'done', 'failed')),
  render_error text,
  render_warning text,
  output_object_key text unique,
  output_url text,
  duration_seconds double precision,
  rendered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index movie_recap_episodes_project_idx
  on movie_recap_episodes(project_id, start_beat, created_at);

alter table movie_recap_episodes enable row level security;

create policy "movie_recap_episodes_own" on movie_recap_episodes for all
  using (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ));

create policy "movie_recap_episodes_feature_gate" on movie_recap_episodes
  as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
