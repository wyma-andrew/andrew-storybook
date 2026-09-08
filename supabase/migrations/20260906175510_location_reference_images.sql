-- Locked reference images for location assets (URL-only, no upload/Storage —
-- users generate externally and paste the link). Chapter-scoped first,
-- mirroring the existing chapter_assets -> bible_entries promote gate: a new
-- image lands on chapter_asset_images, and only becomes the shared,
-- cross-chapter reference once explicitly promoted into bible_entry_images.
-- image_url is nullable — a row can exist as a planned/labelled angle before
-- a link is pasted in. Restricted to kind='location' at the API layer, not
-- a DB constraint (no cross-table check needed for two tables this small).

create table chapter_asset_images (
  id uuid primary key default gen_random_uuid(),
  chapter_asset_id uuid not null references chapter_assets(id) on delete cascade,
  angle_label text not null,
  image_url text,
  is_canonical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bible_entry_images (
  id uuid primary key default gen_random_uuid(),
  bible_entry_id uuid not null references bible_entries(id) on delete cascade,
  angle_label text not null,
  image_url text,
  is_canonical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chapter_asset_images enable row level security;
alter table bible_entry_images enable row level security;

create policy "chapter_asset_images_all_own" on chapter_asset_images for all
  using (exists (
    select 1 from chapter_assets ca
    join chapters c on c.id = ca.chapter_id
    join stories s on s.id = c.story_id
    where ca.id = chapter_asset_images.chapter_asset_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from chapter_assets ca
    join chapters c on c.id = ca.chapter_id
    join stories s on s.id = c.story_id
    where ca.id = chapter_asset_images.chapter_asset_id and s.owner_id = auth.uid()
  ));

create policy "bible_entry_images_all_own" on bible_entry_images for all
  using (exists (
    select 1 from bible_entries be
    join stories s on s.id = be.story_id
    where be.id = bible_entry_images.bible_entry_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from bible_entries be
    join stories s on s.id = be.story_id
    where be.id = bible_entry_images.bible_entry_id and s.owner_id = auth.uid()
  ));
