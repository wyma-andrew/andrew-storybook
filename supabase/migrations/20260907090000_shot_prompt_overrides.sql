-- User-edited versions of a shot's prompts. The generated text stays in
-- prompt / end_frame_prompt / video_prompt and is never overwritten by an
-- edit, so "Restore original" is just clearing the override column.
-- An override is always replaced wholesale by the next edit — no history.
alter table shots
  add column prompt_override text,
  add column end_frame_prompt_override text,
  add column video_prompt_override text;
