-- Adds Google Flow (image-to-video) prompt fields to shots.
-- `prompt` (existing) is the Start Frame image prompt. `end_frame_prompt` is
-- only populated when frame_mode = 'start_and_end_frame' (continuous motion
-- into the next shot); `video_prompt` describes the motion between frames.
alter table shots
  add column end_frame_prompt text,
  add column video_prompt text,
  add column frame_mode text not null default 'start_frame_only'
    check (frame_mode in ('start_frame_only', 'start_and_end_frame'));
