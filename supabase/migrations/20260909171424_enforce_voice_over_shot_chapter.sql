-- RLS is the authorization and integrity boundary for client-reachable rows.
-- In addition to ownership, prevent a narration row from pointing its range
-- at shots from a different chapter (including another chapter by the same
-- owner). Generation and PATCH validate this too; the policy is the backstop.
drop policy "voice_over_segments_all_own" on voice_over_segments;

create policy "voice_over_segments_all_own" on voice_over_segments for all
  using (
    exists (
      select 1 from chapters c join stories s on s.id = c.story_id
      where c.id = voice_over_segments.chapter_id and s.owner_id = auth.uid()
    )
    and exists (
      select 1 from shots sh join scenes sc on sc.id = sh.scene_id
      where sh.id = voice_over_segments.start_shot_id and sc.chapter_id = voice_over_segments.chapter_id
    )
    and exists (
      select 1 from shots sh join scenes sc on sc.id = sh.scene_id
      where sh.id = voice_over_segments.end_shot_id and sc.chapter_id = voice_over_segments.chapter_id
    )
  )
  with check (
    exists (
      select 1 from chapters c join stories s on s.id = c.story_id
      where c.id = voice_over_segments.chapter_id and s.owner_id = auth.uid()
    )
    and exists (
      select 1 from shots sh join scenes sc on sc.id = sh.scene_id
      where sh.id = voice_over_segments.start_shot_id and sc.chapter_id = voice_over_segments.chapter_id
    )
    and exists (
      select 1 from shots sh join scenes sc on sc.id = sh.scene_id
      where sh.id = voice_over_segments.end_shot_id and sc.chapter_id = voice_over_segments.chapter_id
    )
  );
