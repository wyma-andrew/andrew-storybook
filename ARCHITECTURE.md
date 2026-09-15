# AI Storybook architecture

This is the concise, current map of the application. It explains **where**
features live and **how** data moves. Read the matching `history/` record before
changing a feature; history explains **why** its behavior was chosen.

## Product model

One user owns many stories. A story holds shared settings and a reusable Asset
Bible. Each story has many episodes (called `chapters` in code and the database),
and each chapter follows this flow:

```text
Tiptap screenplay
  -> AI asset extraction
  -> chapter characters / locations / props
  -> optional manual promotion into the story Asset Bible
  -> AI storyboard generation
  -> scenes
  -> numbered shots with image + video prompts and continuity metadata
  -> second AI pass maps Voice Over blocks across shot ranges
```

The story's visual style and region (English, Myanmar, or historically grounded,
iconographically recognizable Buddha-era) guide AI generation. The literal style text is composed with an
asset or shot prompt at copy time, keeping stored generated text reusable when
the style changes. A story-wide motion style (Natural, Sacred Cinematic)
does the same for movement: each shot is tagged with a motion mode and the
matching predefined motion paragraph is appended at copy time. Aspect ratio
defaults at story level and can be overridden by a chapter.

## Repository map

```text
app/
  api/                         Next Route Handlers; browser data boundary
    auth/                      Email/password session operations
    (story)/stories/           Story list, detail, trash, bible, chapters (URL: /api/stories)
    chapters/                  Script persistence, extraction, sync, storyboard
    chapters/:id/images/       List + record uploaded renders; /presign mints R2 PUT URLs
    chapter-images/:id         Delete one uploaded render (row + R2 object)
    chapter-assets/            Edit, delete, promote, regenerate, add image
    chapter-asset-images/      Edit/delete/promote chapter location images
    bible-entries/             Edit shared story-bible entries and images
    shots/                     Store/clear user prompt overrides
    voice-overs/               Edit narration text overrides and shot ranges
    (movie-recap)/movie-recaps/ Recap CRUD, multipart source upload, logo upload
    labs/voice/                Authenticated proxy to the self-hosted TTS lab worker
  (app)/                       Shared layout.tsx: renders Sidebar + rounded panel once,
                               so it survives client-side navigation between these routes
    (story)/
      stories/                 Story list/detail and three-step chapter UI (URL: /stories)
    (movie-recap)/
      movie-recap/             Recap project list + four-step editor (URL: /movie-recap)
    account/                   Email display and password change
    labs/voice/                Burmese narration generation test bench
    settings/                  Read-only styles and system prompts
  sign-in/, sign-up/           Supabase Auth UI (standalone Frame, no sidebar, no session yet)

components/
  Frame.tsx                    Standalone page shell for sign-in/sign-up only (no Sidebar)
  Sidebar.tsx                  Persistent left nav: Stories, Movie Recap; collapsible
  ScriptEditor.tsx             Tiptap screenplay editor and import UI
  ChapterHeader.tsx            Chapter navigation and workflow tabs
  StoryControlsMenu.tsx        Story style, motion style, region, aspect, delete, bible
  ChapterControlsMenu.tsx      Chapter aspect override and story region
  ui/                          Shared GeckoUI-backed presentation primitives

lib/
  spoosh.ts                    Typed client API schema and plugins
  openai.ts                    OpenAI client and structured generation calls
  prompts/                     Asset, regeneration, and storyboard instructions
  constants/                   Styles, motion styles, system presets, regions, aspect ratios
  prompt-copy.ts               Final copied-prompt composition
  tiptap-text.ts               Tiptap JSON -> role-tagged AI input
  tiptap/                      Custom screenplay nodes and text importer
  api/                         API types, row mappers, matching, auth guards
  supabase/                    Session-bound route/server/middleware clients

supabase/migrations/           Ordered, authoritative database schema history
workers/voice-lab/             Optional Python VoxCPM2 inference service for lab tests
history/                       Feature decisions and rejected alternatives
demo/                          Static visual references; not part of the app
proxy.ts                       Session refresh and page-route auth redirects
```

## Runtime boundaries

### Browser to API

All React client reads and writes go through the typed Spoosh client in
`lib/spoosh.ts`. It registers cache, invalidation, and optimistic-update
plugins. Components must not call `fetch`, Axios, Supabase, React Query, or SWR
directly.

Spoosh auto-invalidation follows the mutated URL's first segment. Mutations
whose result is embedded under another endpoint must explicitly invalidate that
parent cache—for example, a chapter mutation may also need to invalidate
`stories/:id` because that response embeds `chapters[]`.

### API to database

Route handlers use `supabaseRoute()`, an anon-key client bound to the request's
session cookies. Postgres RLS is the authorization boundary; handlers do not
repeat story-owner checks in application code. Missing or inaccessible owned
rows therefore generally surface as not found or database errors.

`proxy.ts` refreshes the Supabase session on every request. Signed-out page
requests redirect to `/sign-in`; `/api/*` remains reachable so handlers can
return normal API authentication errors.

### API to AI

`lib/openai.ts` calls `gpt-5.6-luna` through Chat Completions with strict JSON
schemas. The operations are:

- `extractAssets()` — characters, locations, and story-relevant props.
- `regenerateAssetPrompt()` — one existing chapter asset.
- `generateStoryboard()` — the chapter site map, then scenes and shots, from script plus known assets.
- `regenerateSceneShots()` — replacement shots for one existing scene.
- `assignVoiceOvers()` — ordered, non-overlapping narration ranges over finalized shots.

Tiptap JSON is flattened by `tiptapToText()` into tagged lines such as
`[SCENE]`, `[ACTION]`, and `[DIALOG]`, so models receive explicit screenplay
roles rather than inferring them from formatting.

Extracted asset names stay verbatim from the script because synchronization and
storyboard references are name-based. A recognized real, historical, or
religious character may carry a separate English `KNOWN IDENTITY` line inside
its visual prompt to improve image-model recognition without changing that key.

## Main feature flows

### Movie Recap (phase one)

- UI: `app/(app)/(movie-recap)/movie-recap/` and `components/movie-recap/`
- API: `app/api/(movie-recap)/movie-recaps/`
- Storage: Cloudflare R2 multipart source upload and presigned logo PUT

Users create resumable recap projects, upload one browser-playable source,
choose the Burmese Narrator profile, and preview aspect, subtitle, logo, and
movable blur configuration. Source bytes upload directly to R2 in parts; the
database retains the multipart id so completed parts survive a reload after the
same local file is reselected. Generate currently records
`ready_for_generation` only. Video analysis, transformation, and output belong
to phase two.

### Burmese Voice Lab

- UI: `app/(app)/labs/voice/`
- API proxy: `app/api/labs/voice/`
- Worker: `workers/voice-lab/`

The authenticated lab sends bounded Burmese test text through Spoosh to a
Next.js route, which forwards it to a separately running self-hosted VoxCPM2
worker. The worker lazily loads the model, applies the code-defined Narrator
voice-design prompt and seed, and returns an in-memory WAV for playback and
download. Lab text and audio are deliberately not stored in Supabase or R2.
`VOICE_LAB_WORKER_URL` stays server-only; an optional shared bearer token
protects the worker connection.

### Script

- UI: `app/stories/[id]/chapters/[chapterId]/script/page.tsx`
- Editor: `components/ScriptEditor.tsx`
- Nodes/import: `lib/tiptap/screenplay-nodes.ts`, `screenplay-parser.ts`
- Persistence: `PATCH /api/chapters/:id`

The editor stores its complete Tiptap document as `chapters.script` JSONB.
Changes are saved through Spoosh as the document changes.
Voice Over is an anonymous block flattened as `[VOICE_OVER]`; explicit import
labels include `Voice Over:`, `Voiceover:`, `VO:`, and `Narration:`.

### Asset extraction and sync

- Prompt rules: `lib/prompts/extract-assets.ts`, `lib/prompts/shared.ts`
- Full rebuild: `POST /api/chapters/:id/analyze`
- Incremental update: `POST /api/chapters/:id/sync`
- Per-card regeneration: `POST /api/chapter-assets/:id/regenerate`
- UI: `app/stories/[id]/chapters/[chapterId]/assets/page.tsx`

Character cards allow chapter-local edits to their short `meta` information and
detailed `real_prompt` through a dialog opened from the card header. Names remain
extraction-owned so Re-Sync and storyboard asset references keep matching.

Re-analyze deletes and recreates all chapter assets. Re-Sync preserves current
rows and prompts, inserts newly found assets, marks missing assets `stale`, and
revives stale rows when their exact entity returns. Existing non-stale names
are supplied to extraction to keep names stable.

Bible matching is normalized name matching within the same asset kind. A match
inherits the bible prompt and location `space_kind`; an unmatched asset starts
as `new`. Promotion creates a `bible_entries` row and changes the chapter asset
to `matched`.

Locations use structured `STRUCTURE SHELL`, `FIXED LAYOUT`, optional `VIEWS`,
and `SPATIAL RULES`. One physical place is merged during extraction. Location
reference images are URL-only and move into the bible only through explicit
promotion. Characters and props currently have no reference-image rows.

### Storyboard

- Prompt rules: `lib/prompts/storyboard.ts`, `lib/prompts/shared.ts`
- Generate: `POST /api/chapters/:id/storyboard/generate`
- Regenerate one scene: `POST /api/scenes/:id/regenerate`
- Read: `GET /api/chapters/:id/storyboard`
- Prompt edit/restore: `PATCH /api/shots/:id`
- UI: `app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`

Generation sends the tagged script and all chapter asset prompts to the model,
then replaces the chapter's existing scenes and shots. The model first returns a
**site map** — which physical place each `[SCENE]` heading plays in, and how the
places connect (the layout anchor a move passes through, and its screen
direction across the cut) — and shoots the chapter against it. The map is stored
on `chapters.site_map` (`lib/site-map.ts` parses and renders it). Every shot stores its
beat, duration, aspect, camera, framing scale, motion mode, image prompt, video
prompt, assets used, and start/end continuity state. Each scene also stores a `lighting` line
shared by its shots, composed into copied prompts rather than baked into them. Duration is clamped to 1–10 seconds. The
model's motion mode passes through `resolveMotionMode()` (`lib/motion.ts`),
which clamps it to a mode the story's motion style allows and reconciles it
with whether the video prompt quotes a spoken line.

User edits are stored in `prompt_override` and `video_prompt_override`; the
generated originals remain intact. Clearing an override restores the original.

When the script contains Voice Over blocks, a second model call maps each block
to a contiguous start/end shot range after the visual shot list is finalized.
Ranges preserve script order and cannot overlap.

A single scene can also be re-shot in place. That call keeps the scene row and
every other scene, hands the model the neighbouring scenes' boundary continuity
states plus the chapter's stored site map (that pass emits no map of its own),
and then re-runs the narration pass over the whole chapter, because
narration ranges may start or end inside the replaced scene. `voice_over_segments` stores
the script snapshot and a nullable text override; narration is copied and
edited separately and is never injected into per-shot video prompts.

### Prompt copying

Copied shot prompts are composed as shot text, then `[Style]`, then
`[Lighting]` (the scene's light), then `[Framing]` (the shot scale's optics line
from `lib/constants/shot-scales.ts`). Asset copies keep `[Style]` first, ahead of
the reference-sheet preset. Stored asset and shot prompts intentionally omit literal style tags. The client
uses `resolveStyleContext()` plus helpers in `lib/prompt-copy.ts` to assemble
the final clipboard text from:

```text
entity or shot prompt + system/reference preset + selected style text
```

A shot's video prompt copy additionally appends the motion paragraph for its
motion mode, resolved from the story's motion style. Motion text is never
stored on the shot, so changing the motion style re-renders every video prompt
without regenerating the storyboard.

Every style defines text for every region. Location plan copies omit visual
style because the plan is a schematic; location view copies choose interior or
exterior presets from `space_kind`.

## Data model

```text
auth.users
  -> stories.owner_id
       -> chapters.story_id
            -> chapter_assets.chapter_id
                 -> chapter_asset_images.chapter_asset_id
            -> scenes.chapter_id
                 -> shots.scene_id
            -> voice_over_segments.chapter_id
       -> bible_entries.story_id
            -> bible_entry_images.bible_entry_id

auth.users
  -> movie_recap_projects.owner_id

chapter_assets.bible_entry_id -> bible_entries.id (nullable)
voice_over_segments.start_shot_id / end_shot_id -> shots.id
```

| Table | Responsibility |
|---|---|
| `stories` | Ownership, title, description, style slug, motion style slug, region, aspect, soft delete |
| `chapters` | Episode order, Tiptap script, workflow status, aspect override, storyboard site map |
| `chapter_assets` | Chapter-local extracted asset and bible match state |
| `bible_entries` | Story-wide approved character/location/prop identity |
| `chapter_images` | Externally generated renders uploaded to R2, per chapter |
| `chapter_asset_images` | Pending chapter-scoped location image URLs |
| `bible_entry_images` | Promoted story-wide location image URLs |
| `scenes` | Ordered storyboard scenes and their lighting line |
| `shots` | Ordered prompts, overrides, references, beat, framing scale, motion mode, and continuity state |
| `voice_over_segments` | Anonymous narration snapshots, overrides, and inclusive shot ranges |
| `movie_recap_projects` | Recap source metadata, resumable upload state, configuration, and readiness |

All tables have RLS. Deleting a story cascades through its owned hierarchy;
normal story deletion is soft deletion through `stories.deleted_at`, while the
Trash screen can permanently delete it.

Visual styles, motion styles, shot-scale optics, and system presets are not
tables. Their sources of truth are `lib/constants/visual-styles.ts`,
`lib/constants/motion-styles.ts`, `lib/constants/shot-scales.ts`, and
`lib/constants/system-prompts.ts`.

## Implemented surface and current limits

Implemented: email/password auth, per-user stories, soft-delete trash,
multi-chapter stories, Tiptap screenplay import/editing, three-kind asset
extraction, chapter-local character-info and prompt editing, story bible promotion,
location reference-image URLs, storyboard
generation, editable/restorable shot prompts, style/region selection,
story-wide motion style with a per-shot motion mode override, per-scene
storyboard regeneration, and
story/chapter aspect ratios, and a per-chapter gallery of externally generated
images uploaded to R2 and ordered by file name. Anonymous Voice Over blocks are mapped to editable
storyboard shot ranges as a separate narration overlay. The UI ships a dark and a
light theme, chosen by the user in the account menu (dark by default, OS
preference deliberately ignored).

Movie Recap phase one is implemented as owner-scoped projects with resumable
R2 source upload, playable preview, persisted settings/customization, and a
ready-for-generation handoff. Recap processing and output are not implemented.

Current intentional limits: no OAuth, magic link, password-reset flow,
database style editor, or character/prop reference images. Uploaded chapter
images go to Cloudflare R2 (presigned PUT straight from the browser); the
location/character reference-image rows remain URL-only and unrelated to it. The `demo/` directory is reference-only.

## Decision-history index

| Feature | Decision record |
|---|---|
| Asset extraction, sync, props, location merging | `history/asset-extraction.md` |
| Prompt-hint tooltip behavior | `history/prompt-hint-tooltip.md` |
| Visual styles and regional text | `history/visual-styles.md` |
| Story regions and cultural/historical adaptation | `history/regions.md` |
| Voice Over blocks, mapping, and range editing | `history/voice-over.md` |
| Motion styles and per-shot motion modes | `history/motion-styles.md` |
| Per-scene storyboard regeneration | `history/storyboard-scene-regeneration.md` |
| Chapter site map fed into shot generation | `history/storyboard-site-map.md` |
| Copied-prompt order, style position, scene lighting | `history/shot-prompt-composition.md` |
| Shot prompts holding the location reference | `history/shot-location-consistency.md` |
| Chapter image gallery and R2 uploads | `history/chapter-images.md` |
| Movie Recap phase-one projects and uploads | `history/movie-recap.md` |
| Burmese self-hosted narration experiments | `history/voice-lab.md` |
| Light/dark theming and color tokens | `history/theming.md` |
| Documentation ownership and maintenance | `history/project-documentation.md` |

## Maintenance rule

Update this document when a change moves a feature's main files, changes a
request/data flow, adds or removes a table relationship, or materially changes
the implemented product surface. Keep implementation details in code and
decision reasoning in `history/`; this file should remain a fast orientation
map rather than a second specification.
