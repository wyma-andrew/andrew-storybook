-- Per-chapter gallery of images generated in an EXTERNAL tool (Flow, Midjourney,
-- etc) and uploaded to Cloudflare R2. This is the first upload/storage flow in
-- the app and does not replace the URL-only reference-image rows: those are
-- identity/layout references pasted by hand, these are finished renders the user
-- produced from the chapter's prompts.
--
-- The bytes never pass through the app. The browser PUTs straight to R2 on a
-- presigned URL, then commits a row here — so there is no request-body size
-- limit to work around, which is the whole reason for the split.
--
-- object_key is the source of truth for the R2 object and carries the chapter id,
-- so a delete can remove the object without reconstructing a path. url is the
-- public read URL, stored rather than derived: R2_PUBLIC_BASE_URL can change
-- (r2.dev -> custom domain) and an already-uploaded image must keep resolving.
--
-- file_name is the ORIGINAL name, kept because the gallery is ordered by it —
-- these files are named for the shots they came from ("1.2.png"), and that name
-- is the only ordering the user has. It is not unique: re-uploading a corrected
-- render is a normal thing to do, and both rows are kept so the newer one is
-- visibly newer rather than silently replacing history.
create table chapter_images (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  file_name text not null,
  object_key text not null unique,
  url text not null,
  content_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index chapter_images_chapter_id_idx on chapter_images (chapter_id);

alter table chapter_images enable row level security;

create policy "chapter_images_all_own" on chapter_images for all
  using (exists (
    select 1 from chapters c
    join stories s on s.id = c.story_id
    where c.id = chapter_images.chapter_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from chapters c
    join stories s on s.id = c.story_id
    where c.id = chapter_images.chapter_id and s.owner_id = auth.uid()
  ));
