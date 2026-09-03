-- Per-user story ownership. Story-scoped tables are enforced via RLS keyed
-- off stories.owner_id; route handlers use a session-bound (anon key)
-- Supabase client for these tables instead of the service-role client, so
-- these policies are the actual authorization boundary, not decoration.
-- Global tables (visual_styles scope='global', system_prompts) stay
-- service-role-only — no user policies needed there.

alter table stories add column owner_id uuid references auth.users(id) on delete cascade;

-- ---------- stories ----------
create policy "stories_select_own" on stories for select
  using (owner_id = auth.uid());
create policy "stories_insert_own" on stories for insert
  with check (owner_id = auth.uid());
create policy "stories_update_own" on stories for update
  using (owner_id = auth.uid());
create policy "stories_delete_own" on stories for delete
  using (owner_id = auth.uid());

-- ---------- chapters (via story ownership) ----------
create policy "chapters_all_own" on chapters for all
  using (exists (select 1 from stories s where s.id = chapters.story_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from stories s where s.id = chapters.story_id and s.owner_id = auth.uid()));

-- ---------- bible_entries (via story ownership) ----------
create policy "bible_entries_all_own" on bible_entries for all
  using (exists (select 1 from stories s where s.id = bible_entries.story_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from stories s where s.id = bible_entries.story_id and s.owner_id = auth.uid()));

-- ---------- chapter_assets (via chapter -> story ownership) ----------
create policy "chapter_assets_all_own" on chapter_assets for all
  using (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = chapter_assets.chapter_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = chapter_assets.chapter_id and s.owner_id = auth.uid()
  ));

-- ---------- scenes (via chapter -> story ownership) ----------
create policy "scenes_all_own" on scenes for all
  using (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = scenes.chapter_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from chapters c join stories s on s.id = c.story_id
    where c.id = scenes.chapter_id and s.owner_id = auth.uid()
  ));

-- ---------- shots (via scene -> chapter -> story ownership) ----------
create policy "shots_all_own" on shots for all
  using (exists (
    select 1 from scenes sc join chapters c on c.id = sc.chapter_id join stories s on s.id = c.story_id
    where sc.id = shots.scene_id and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from scenes sc join chapters c on c.id = sc.chapter_id join stories s on s.id = c.story_id
    where sc.id = shots.scene_id and s.owner_id = auth.uid()
  ));

-- ---------- visual_styles: global readable by any signed-in user, ----------
-- ---------- story-scoped readable/writable only by the story's owner ----------
create policy "visual_styles_select" on visual_styles for select
  using (
    scope = 'global'
    or exists (select 1 from stories s where s.id = visual_styles.story_id and s.owner_id = auth.uid())
  );
create policy "visual_styles_insert_own_story" on visual_styles for insert
  with check (
    scope = 'story'
    and exists (select 1 from stories s where s.id = visual_styles.story_id and s.owner_id = auth.uid())
  );

-- ---------- system_prompts: readable by any signed-in user, ----------
-- ---------- writes stay service-role-only (admin console bypasses RLS) ----------
create policy "system_prompts_select" on system_prompts for select
  using (true);
