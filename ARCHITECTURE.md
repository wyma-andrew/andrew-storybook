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
```

The story's visual style and region guide AI generation. The literal style text
is composed with an asset or shot prompt at copy time, keeping stored generated
text reusable when the style changes. Aspect ratio defaults at story level and
can be overridden by a chapter.

## Repository map

```text
app/
  api/                         Next Route Handlers; browser data boundary
    auth/                      Email/password session operations
    stories/                   Story list, detail, trash, bible, chapters
    chapters/                  Script persistence, extraction, sync, storyboard
    chapter-assets/            Edit, delete, promote, regenerate, add image
    chapter-asset-images/      Edit/delete/promote chapter location images
    bible-entries/             Edit shared story-bible entries and images
    shots/                     Store/clear user prompt overrides
  stories/                     Story list/detail and three-step chapter UI
  account/                     Email display and password change
  settings/                    Read-only styles and system prompts
  sign-in/, sign-up/           Supabase Auth UI

components/
  ScriptEditor.tsx             Tiptap screenplay editor and import UI
  ChapterHeader.tsx            Chapter navigation and workflow tabs
  StoryControlsMenu.tsx        Story style, region, aspect, delete, bible
  ChapterControlsMenu.tsx      Chapter aspect override and story region
  ui/                          Shared GeckoUI-backed presentation primitives

lib/
  spoosh.ts                    Typed client API schema and plugins
  openai.ts                    OpenAI client and structured generation calls
  prompts/                     Asset, regeneration, and storyboard instructions
  constants/                   Styles, system presets, regions, aspect ratios
  prompt-copy.ts               Final copied-prompt composition
  tiptap-text.ts               Tiptap JSON -> role-tagged AI input
  tiptap/                      Custom screenplay nodes and text importer
  api/                         API types, row mappers, matching, auth guards
  supabase/                    Session-bound route/server/middleware clients

supabase/migrations/           Ordered, authoritative database schema history
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
schemas. The three operations are:

- `extractAssets()` — characters, locations, and story-relevant props.
- `regenerateAssetPrompt()` — one existing chapter asset.
- `generateStoryboard()` — scenes and shots from script plus known assets.

Tiptap JSON is flattened by `tiptapToText()` into tagged lines such as
`[SCENE]`, `[ACTION]`, and `[DIALOG]`, so models receive explicit screenplay
roles rather than inferring them from formatting.

## Main feature flows

### Script

- UI: `app/stories/[id]/chapters/[chapterId]/script/page.tsx`
- Editor: `components/ScriptEditor.tsx`
- Nodes/import: `lib/tiptap/screenplay-nodes.ts`, `screenplay-parser.ts`
- Persistence: `PATCH /api/chapters/:id`

The editor stores its complete Tiptap document as `chapters.script` JSONB.
Changes are saved through Spoosh as the document changes.

### Asset extraction and sync

- Prompt rules: `lib/prompts/extract-assets.ts`, `lib/prompts/shared.ts`
- Full rebuild: `POST /api/chapters/:id/analyze`
- Incremental update: `POST /api/chapters/:id/sync`
- Per-card regeneration: `POST /api/chapter-assets/:id/regenerate`
- UI: `app/stories/[id]/chapters/[chapterId]/assets/page.tsx`

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
- Read: `GET /api/chapters/:id/storyboard`
- Prompt edit/restore: `PATCH /api/shots/:id`
- UI: `app/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`

Generation sends the tagged script and all chapter asset prompts to the model,
then replaces the chapter's existing scenes and shots. Every shot stores its
beat, duration, aspect, camera, image prompt, video prompt, assets used, and
start/end continuity state. Duration is clamped to 1–10 seconds.

User edits are stored in `prompt_override` and `video_prompt_override`; the
generated originals remain intact. Clearing an override restores the original.

### Prompt copying

Stored asset and shot prompts intentionally omit literal style tags. The client
uses `resolveStyleContext()` plus helpers in `lib/prompt-copy.ts` to assemble
the final clipboard text from:

```text
entity or shot prompt + system/reference preset + selected style text
```

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
       -> bible_entries.story_id
            -> bible_entry_images.bible_entry_id

chapter_assets.bible_entry_id -> bible_entries.id (nullable)
```

| Table | Responsibility |
|---|---|
| `stories` | Ownership, title, description, style slug, region, aspect, soft delete |
| `chapters` | Episode order, Tiptap script, workflow status, aspect override |
| `chapter_assets` | Chapter-local extracted asset and bible match state |
| `bible_entries` | Story-wide approved character/location/prop identity |
| `chapter_asset_images` | Pending chapter-scoped location image URLs |
| `bible_entry_images` | Promoted story-wide location image URLs |
| `scenes` | Ordered storyboard scenes |
| `shots` | Ordered prompts, overrides, references, beat, and continuity state |

All tables have RLS. Deleting a story cascades through its owned hierarchy;
normal story deletion is soft deletion through `stories.deleted_at`, while the
Trash screen can permanently delete it.

Visual styles and system presets are not tables. Their sources of truth are
`lib/constants/visual-styles.ts` and `lib/constants/system-prompts.ts`.

## Implemented surface and current limits

Implemented: email/password auth, per-user stories, soft-delete trash,
multi-chapter stories, Tiptap screenplay import/editing, three-kind asset
extraction, story bible promotion, location reference-image URLs, storyboard
generation, editable/restorable shot prompts, style/region selection, and
story/chapter aspect ratios.

Current intentional limits: no OAuth, magic link, password-reset flow,
database style editor, file upload/storage flow, or character/prop reference
images. The `demo/` directory is reference-only.

## Decision-history index

| Feature | Decision record |
|---|---|
| Asset extraction, sync, props, location merging | `history/asset-extraction.md` |
| Prompt-hint tooltip behavior | `history/prompt-hint-tooltip.md` |
| Visual styles and regional text | `history/visual-styles.md` |
| Documentation ownership and maintenance | `history/project-documentation.md` |

## Maintenance rule

Update this document when a change moves a feature's main files, changes a
request/data flow, adds or removes a table relationship, or materially changes
the implemented product surface. Keep implementation details in code and
decision reasoning in `history/`; this file should remain a fast orientation
map rather than a second specification.
