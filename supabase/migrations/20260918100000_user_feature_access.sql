-- Per-user feature access. One row per auth user, created by trigger, with a
-- boolean per top-level feature. Admins grant access from /admin; nothing is
-- granted automatically, including to users who existed before this migration.
--
-- Email is mirrored here on purpose: the admin list is then an ordinary query
-- against a table RLS can protect, instead of a paginated auth.admin.listUsers()
-- call that cannot be joined or sorted server-side.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  can_use_stories boolean not null default false,
  can_use_movie_recap boolean not null default false,
  can_use_voice_lab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Read-only to its owner. Every write goes through the service-role admin
-- routes, so there is deliberately no insert/update/delete policy: a user
-- cannot grant themselves a feature.
create policy "profiles_select_own" on profiles for select
  using (id = auth.uid());

create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Keeps the mirrored email true after an address change.
create function handle_user_email_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function handle_user_email_change();

insert into profiles (id, email)
  select id, coalesce(email, '') from auth.users
  on conflict (id) do nothing;

-- security definer so the feature check itself is not subject to the profiles
-- policy above — a policy that read profiles under RLS would recurse.
create function has_feature(feature text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case feature
       when 'stories' then can_use_stories
       when 'movie_recap' then can_use_movie_recap
       when 'voice_lab' then can_use_voice_lab
       else false
     end
     from profiles where id = auth.uid()),
    false);
$$;

-- The gate is a RESTRICTIVE policy per table rather than an edit to each
-- existing owner policy. Restrictive policies are ANDed with the permissive
-- ones, so ownership keeps its single definition and this cannot drift from it;
-- rewriting ten `for all` policies would mean restating each ownership subquery
-- correctly, and a typo there would silently widen access instead of narrowing
-- it.
--
-- Every story-scoped table carries its own gate. Relying on the child policies'
-- subquery against `stories` to inherit it would be depending on how Postgres
-- applies RLS inside a policy expression — true today, and not something the
-- authorization boundary should rest on.

create policy "stories_feature_gate" on stories as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "chapters_feature_gate" on chapters as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "bible_entries_feature_gate" on bible_entries as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "bible_entry_images_feature_gate" on bible_entry_images as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "chapter_assets_feature_gate" on chapter_assets as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "chapter_asset_images_feature_gate" on chapter_asset_images as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "chapter_images_feature_gate" on chapter_images as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "scenes_feature_gate" on scenes as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "shots_feature_gate" on shots as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));
create policy "voice_over_segments_feature_gate" on voice_over_segments as restrictive for all
  using (has_feature('stories')) with check (has_feature('stories'));

create policy "movie_recap_projects_feature_gate" on movie_recap_projects as restrictive for all
  using (has_feature('movie_recap')) with check (has_feature('movie_recap'));
