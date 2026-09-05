-- system_prompts (admin character/location boilerplate) and the global
-- visual_styles built-ins move out of the DB into code constants
-- (lib/constants/system-prompts.ts, lib/constants/visual-styles.ts).
-- visual_styles becomes a flat, user-owned table (no more scope/source/
-- story_id) — one style list per user, usable across all their stories.

-- ---------- stories.visual_style_id: uuid -> text ----------
-- A story can now point at a built-in slug ("3d-animation", not a uuid) or a
-- user's own visual_styles row (uuid-as-text). Drop the FK first (can't FK a
-- column that may hold a non-row value), widen the column, then migrate the
-- one existing built-in style's references to its new file-defined slug.
alter table stories drop constraint stories_visual_style_fk;
alter table stories alter column visual_style_id type text using visual_style_id::text;

update stories
set visual_style_id = '3d-animation'
where visual_style_id = (select id::text from visual_styles where scope = 'global' and source = 'built_in' and name = '3D Animation');

-- ---------- visual_styles: drop global/story scoping, make it owner-scoped ----------
drop policy if exists "visual_styles_select" on visual_styles;
drop policy if exists "visual_styles_insert_own_story" on visual_styles;

delete from visual_styles where scope = 'global';

alter table visual_styles drop constraint visual_styles_story_scope;
alter table visual_styles drop constraint visual_styles_scope_check;
alter table visual_styles drop constraint visual_styles_source_check;
alter table visual_styles drop constraint visual_styles_story_id_fkey;
alter table visual_styles drop column scope;
alter table visual_styles drop column source;
alter table visual_styles drop column story_id;

alter table visual_styles add column owner_id uuid references auth.users(id) on delete cascade;
alter table visual_styles alter column owner_id set not null;

create policy "visual_styles_select_own" on visual_styles for select
  using (owner_id = auth.uid());
create policy "visual_styles_insert_own" on visual_styles for insert
  with check (owner_id = auth.uid());
create policy "visual_styles_update_own" on visual_styles for update
  using (owner_id = auth.uid());
create policy "visual_styles_delete_own" on visual_styles for delete
  using (owner_id = auth.uid());

-- ---------- system_prompts: fully replaced by lib/constants/system-prompts.ts ----------
drop table system_prompts;
