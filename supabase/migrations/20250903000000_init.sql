-- AI Storybook schema
-- RLS enabled on every table, no policies added: only the service-role
-- client (used server-side in Next.js route handlers) can read/write.
-- Add policies here if/when a user-facing auth flow lands.

create extension if not exists pgcrypto;

-- ---------- stories ----------
create table stories (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Story',
  description text,
  visual_style_id uuid, -- fk added below, after visual_styles exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- visual styles ----------
-- scope='global': platform-wide library (Realistic, Anime, ...), story_id null.
-- scope='story': one-off custom style owned by a single story.
create table visual_styles (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','story')),
  story_id uuid references stories(id) on delete cascade,
  name text not null,
  description text,
  swatch text,
  source text not null default 'custom' check (source in ('built_in','custom')),
  created_at timestamptz not null default now(),
  constraint visual_styles_story_scope check (
    (scope = 'global' and story_id is null) or
    (scope = 'story' and story_id is not null)
  )
);

alter table stories
  add constraint stories_visual_style_fk foreign key (visual_style_id) references visual_styles(id);

-- ---------- system prompts (admin-only, one row per kind) ----------
create table system_prompts (
  id uuid primary key default gen_random_uuid(),
  kind text not null unique check (kind in ('character','location')),
  prompt text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ---------- chapters ----------
create table chapters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  index int not null,
  title text not null default 'Untitled chapter',
  script jsonb, -- Tiptap document JSON
  status text not null default 'script' check (status in ('script','assets','storyboard','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, index)
);

-- ---------- story asset bible (character / location, story-scoped) ----------
create table bible_entries (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  kind text not null check (kind in ('character','location')),
  name text not null,
  meta text,
  real_prompt text not null, -- entity-specific description only; style + system preset are injected, not stored here
  seed text,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- per-chapter extracted assets ----------
-- bible_entry_id set -> matched against the story bible (locked prompt reused).
-- bible_entry_id null -> new to this chapter, not yet promoted to the bible.
create table chapter_assets (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  kind text not null check (kind in ('character','location')),
  bible_entry_id uuid references bible_entries(id) on delete set null,
  name text not null,
  meta text,
  real_prompt text not null,
  match_status text not null default 'local' check (match_status in ('matched','new','local')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- storyboard: scenes ----------
create table scenes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  index int not null,
  title text,
  slug text, -- e.g. "INT. ASHFALL LIGHTHOUSE — LANTERN ROOM — NIGHT"
  created_at timestamptz not null default now(),
  unique (chapter_id, index)
);

-- ---------- storyboard: shots ----------
create table shots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references scenes(id) on delete cascade,
  index int not null, -- shot number within the scene (1, 2, 3 -> "1.1", "1.2")
  label text,
  duration_s int,
  aspect text,
  camera text,
  prompt text not null,
  created_at timestamptz not null default now(),
  unique (scene_id, index)
);

-- ---------- RLS ----------
alter table stories enable row level security;
alter table visual_styles enable row level security;
alter table system_prompts enable row level security;
alter table chapters enable row level security;
alter table bible_entries enable row level security;
alter table chapter_assets enable row level security;
alter table scenes enable row level security;
alter table shots enable row level security;

-- ---------- seed: built-in visual styles ----------
insert into visual_styles (scope, name, description, swatch, source) values
  ('global', 'Realistic', 'Photorealistic, natural lighting, 50mm lens, shallow depth of field, true-to-life color.', '#d9d3c2', 'built_in'),
  ('global', 'Anime', 'Cel-shaded anime illustration, clean linework, saturated flat color, dynamic camera angles.', '#e79a9a', 'built_in'),
  ('global', 'Watercolour', 'Soft watercolour illustration, visible paper texture, loose linework, muted washes.', '#9ac2d9', 'built_in'),
  ('global', 'Noir Comic', 'High-contrast black & white ink, heavy shadow, halftone shading, comic panel framing.', '#8f8f92', 'built_in');

-- ---------- seed: system prompts ----------
insert into system_prompts (kind, prompt, updated_by) values
  ('character', 'Portrait composition, subject centered, shot on 50mm, natural or motivated key light, shallow depth of field. Maintain exact facial structure, hair, and wardrobe across every generation for this character.', 'system'),
  ('location', 'Environment establishing composition, wide or medium-wide framing, consistent geometry and materials across every generation for this location, no characters present unless specified.', 'system');
