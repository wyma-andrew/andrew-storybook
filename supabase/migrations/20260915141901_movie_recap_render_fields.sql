alter table movie_recap_projects
  add column render_status text not null default 'idle' check (render_status in ('idle', 'running', 'done', 'failed')),
  add column render_error text,
  add column render_transcript jsonb,
  add column render_script jsonb,
  add column render_output_url text,
  add column render_output_object_key text,
  add column render_subtitle_url text,
  add column render_subtitle_object_key text,
  add column render_started_at timestamptz,
  add column render_completed_at timestamptz;
