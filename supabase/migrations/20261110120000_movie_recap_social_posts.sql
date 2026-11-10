create table movie_recap_social_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references movie_recap_projects(id) on delete cascade,
  platform text not null default 'facebook' check (platform in ('facebook')),
  kind text not null default 'reel' check (kind in ('reel')),
  external_id text not null,
  description text not null default '',
  publish_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'published', 'cancelled', 'failed')),
  permalink_url text,
  error text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create index movie_recap_social_posts_project_idx
  on movie_recap_social_posts(project_id, publish_at desc);

alter table movie_recap_social_posts enable row level security;

create policy "movie_recap_social_posts_own" on movie_recap_social_posts for all
  using (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from movie_recap_projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ));

create policy "movie_recap_social_posts_feature_gate" on movie_recap_social_posts
  as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
