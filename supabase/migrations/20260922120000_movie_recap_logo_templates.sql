create table movie_recap_logo_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  logo_file_name text not null,
  logo_object_key text not null unique,
  logo_url text not null,
  logo_content_type text not null,
  logo_size_bytes bigint not null check (logo_size_bytes > 0),
  logo_enabled boolean not null default true,
  logo_placement text not null default 'top_left'
    check (logo_placement in ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  logo_opacity smallint not null default 100 check (logo_opacity between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index movie_recap_logo_templates_owner_updated_idx
  on movie_recap_logo_templates (owner_id, updated_at desc);

alter table movie_recap_logo_templates enable row level security;

create policy "movie_recap_logo_templates_select_own" on movie_recap_logo_templates for select
  using (owner_id = auth.uid());
create policy "movie_recap_logo_templates_insert_own" on movie_recap_logo_templates for insert
  with check (owner_id = auth.uid());
create policy "movie_recap_logo_templates_update_own" on movie_recap_logo_templates for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "movie_recap_logo_templates_delete_own" on movie_recap_logo_templates for delete
  using (owner_id = auth.uid());

create policy "movie_recap_logo_templates_feature_gate" on movie_recap_logo_templates as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
