-- Tracks which known characters/locations a shot actually depicts, so the
-- storyboard UI can tell the user which reference prompts/images to attach
-- alongside the shot's own Start/End Frame prompts when generating.
alter table shots
  add column assets_used jsonb not null default '[]'::jsonb;
