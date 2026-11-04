# AI Storybook architecture

This is the concise, current map of the application. It explains **where**
features live and **how** data moves. Read the matching `history/` record before
changing a feature; history explains **why** its behavior was chosen.

## Product model

One user owns many stories. A story holds shared settings. Each story has many episodes (called `chapters` in code and the database),
and each chapter follows this flow:

```text
Tiptap screenplay
  -> AI asset extraction
  -> chapter characters / locations / props
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
matching predefined motion paragraph is appended at copy time. A story-wide
format (Cinematic, Cozy POV ASMR) changes what the storyboard pass produces:
the ASMR format appends first-person hands/process/pacing rules to the same
prompt and adds a per-shot sound prompt. Aspect ratio
defaults at story level and can be overridden by a chapter.

## Repository map

```text
app/
  api/                         Next Route Handlers; browser data boundary
    auth/                      Email/password session operations
    admin/users/               Admin-only: list/create accounts, set feature flags, delete
    (story)/stories/           Story list, detail, trash, chapters (URL: /api/stories)
    (story)/stories/:id/export  One story as a portable JSON bundle
    (story)/stories/import      Rebuilds a bundle as a new story owned by the caller
    chapters/                  Script persistence, extraction, sync, storyboard
    chapters/:id/images/       List + record uploaded renders; /presign mints R2 PUT URLs
    chapter-images/:id         Delete one uploaded render (row + R2 object)
    chapter-assets/            Edit, delete, regenerate, add image
    chapter-asset-images/      Edit/delete chapter location images
    shots/                     Store/clear user prompt overrides
    voice-overs/               Edit narration text overrides and shot ranges
    (movie-recap)/movie-recaps/ Recap CRUD, source/logo upload, full and beat-range render
    (translate)/translate-projects/ Translate CRUD, multipart source upload, MP4 render
    (recap-v2)/recap-v2-projects/ Recap V2 CRUD, upload, transcribe, translate, Smart Sync render
    (transcript)/transcript-projects/ Burmese video upload and speech-to-text
    labs/voice/                Authenticated proxy to the VoxCPM2 lab worker
    labs/prompt/               Admin-only: storyboard / asset-extraction preview, sandbox runs
  (app)/                       Shared layout.tsx: renders MobileNavProvider, Sidebar and the
                               rounded panel once, so they survive client-side navigation here
    (story)/
      stories/                 Story list/detail and three-step chapter UI (URL: /stories)
    (movie-recap)/
      movie-recap/             Recap project list + five-step editor (URL: /movie-recap)
    (translate)/
      translate/               Translate project list, upload and editor (URL: /translate)
    (recap-v2)/
      recap-v2/                Recap V2 project list, upload and editor (URL: /recap-v2)
    (transcript)/
      transcript/              Burmese transcript list, upload and viewer (URL: /transcript)
    account/                   Email display and password change
    admin/                     User manager: accounts and per-user feature access
    no-access/                 Shown when a feature is not enabled for the account
    labs/voice/                Burmese narration generation test bench
    labs/prompt/               Admin-only Prompt Lab: inspect, edit, run and compare storyboard and asset prompts
    settings/                  Read-only styles and system prompts
  sign-in/, sign-up/           Supabase Auth UI (standalone Frame, no sidebar, no session yet)

components/
  Frame.tsx                    Standalone page shell for sign-in/sign-up only (no Sidebar)
  Sidebar.tsx                  Persistent left nav: Stories (admin: Prompt Lab nested under it), Movie Recap, Recap V2, Transcript, Translate, Voice Lab.
                               Collapsible rail from md up; off-canvas Drawer below md
  MobileNav.tsx                Mobile drawer open state + the md:hidden hamburger button
                               (rendered by TopBar and ChapterHeader)
  ScriptEditor.tsx             Tiptap screenplay editor and import UI
  StoryTransfer.tsx            Export-story menu item and import-file button
  ChapterHeader.tsx            Chapter navigation and workflow tabs
  StoryControlsMenu.tsx        Story style, motion style, region, aspect, export, delete
  ChapterControlsMenu.tsx      Chapter aspect override and story region
  ui/                          Shared GeckoUI-backed presentation primitives

lib/
  spoosh.ts                    Typed client API schema and plugins
  openai.ts                    OpenAI client and structured generation calls
  prompts/                     Asset, regeneration, and storyboard instructions
  constants/                   Styles, motion styles, story formats, system presets, regions, aspect ratios
  prompt-copy.ts               Final copied-prompt composition
  storyboard-inputs.ts         Chapter -> storyboard-pass inputs (Generate route and Prompt Lab)
  prompt-lab.ts                Prompt Lab types, models, row mappers
  story-transfer.ts            Story bundle build/parse/import (cross-account transfer)
  tiptap-text.ts               Tiptap JSON -> role-tagged AI input
  tiptap/                      Custom screenplay nodes and text importer
  api/                         API types, row mappers, matching, auth guards
  supabase/                    Session-bound route/server/middleware clients

supabase/migrations/           Ordered, authoritative database schema history
workers/voice-lab/             Optional Python VoxCPM2 inference service for lab tests
workers/funasr/                FunASR Paraformer-zh speech worker (Chinese, character stamps)
workers/whisper-mm/            Whisper large-v3 speech worker (Burmese)
history/                       Feature decisions and rejected alternatives
demo/                          Static visual references; not part of the app
proxy.ts                       Session refresh and page-route auth redirects
```

## Runtime boundaries

### Deployment

Production is one Docker container on a shared Contabo server, behind its reverse
proxy (`.github/DEPLOYMENT.md`). A push to `main` runs
`.github/workflows/deploy.yml`. ffmpeg-based work runs in that container unless
`RECAP_JOB_RUNNER=github` sends recap script and render jobs to Actions.
Migrations are not part of deploy.

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
The root page sends signed-in users to their first enabled feature (or Admin
when they have no feature), and sign-in returns there after authentication.

### Feature access

Stories, Movie Recap, Translate, and Voice Lab are granted per user. The flags live on
`profiles` (one row per auth user, created by trigger) and are enforced by the
`has_feature()` SQL function, applied as a restrictive policy on every gated
table — `movie_recap_projects`, `translate_projects`, and `stories` with each story-scoped child.
`requireFeature()` in `lib/api/auth-guard.ts` adds a 403 that names the feature,
and is the only boundary for Voice Lab, which owns no table. A
`layout.tsx` per feature route group redirects to `/no-access`, and the sidebar
lists only the features the account has.

The admin routes under `app/api/admin/` are the one place that touches other
users' rows: they use `supabaseAdmin()` and are gated by `requireAdmin()` in
application code, against `profiles.is_admin` — with the `ADMIN_EMAILS` env
allowlist kept as break-glass, so the last admin cannot be locked out. Nothing
is granted by default, including to accounts that predate the feature — see
`history/admin-users.md`.

### API to AI

`lib/openai.ts` calls `gpt-6-luna` through Chat Completions with strict JSON
schemas. The operations are:

- `extractAssets()` — characters, locations, and story-relevant props.
- `regenerateAssetPrompt()` — one existing chapter asset.
- `generateStoryboard()` — the chapter site map, then scenes and shots, from script plus known assets.
  The story format picks the schema: only `cozy-asmr` adds `soundPrompt`.
- `regenerateSceneShots()` — replacement shots for one existing scene.
- `assignVoiceOvers()` — ordered, non-overlapping narration ranges over finalized shots.

The storyboard and asset-extraction passes are each split into a message
builder (`storyboardMessages()`, `extractAssetsMessages()`) and a call
(`runStoryboardPass()`, `runExtractAssetsPass()`), so Prompt Lab (`/labs/prompt`)
shows and runs the exact request production sends; both system prompts are
built as ordered labeled blocks (`lib/prompts/parts.ts`) that the lab displays
one by one. Lab runs are saved to
`prompt_lab_runs` and never touch assets, scenes or shots; an extraction run can
feed a storyboard run's Known Assets, and one scene of a storyboard run can be
re-shot (`runSceneShotsPass()` + `sceneScopePrompt()`, the same scope block
`regenerateSceneShots()` sends) — see `history/prompt-lab.md`.

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

Users create resumable recap projects, upload one browser-playable source, read
paste its transcript and Burmese story at the Transcript step,
choose a Burmese narration voice from the shared TTS catalog, and preview
aspect, subtitle, logo, and blur configuration. Blur areas can be added,
removed, moved, resized, and set by percentage coordinates in Customize. Every shot gets the
house look from `lib/movie-recap-transform.ts` — a per-project zoom, colour grade, mirror, and a
blurred fill behind letterbox bars (`MOVIE_RECAP_LOOK`); there is no toggle, and
no per-shot speed. Subtitle appearance uses two colour/outline presets, with
an optional per-project font size in percent of frame height; an unset size
follows the aspect ratio. Position and edge distance are also adjustable. The source's pixel dimensions are read in the browser and stored, and seed the
aspect ratio and fit mode once at upload. Source bytes upload directly to R2 in parts; the
database retains the multipart id so completed parts survive a reload after the
same local file is reselected. The Replace video button uses the same multipart
path for a better-quality copy of the same cut. It keeps the transcript,
narrative script, narration, and Customize Video settings, while clearing the
source crop, render artifacts, and browser render history; the next render
re-measures the crop on the new file. Generate currently records
`ready_for_generation` only.
After upload, the browser captures the source's first frame as a JPEG cover in
R2 for the project-list card. Cards without a saved cover show the Clapperboard
icon. Add Source's Set cover action saves the frame at the visible source
player's current time and can replace an existing cover. Source replacement
clears the prior cover.
The wizard's step and its customize sub-tab are
query-string state (`?step=`, `?tab=`) held by nuqs, so a step is linkable and
survives a reload; `app/layout.tsx` mounts `NuqsAdapter` for the whole app.
The project row stores `current_step` for the selected step and `max_step` for
the furthest unlocked step, so returning to Narrative Script does not lock
Customize or Review after a reload.
The Customize Logo tab accepts either a reusable per-user template or a one-off
project logo. Templates retain only the independent R2 logo asset and optional
watermark text; placement and opacity remain project settings. Template
create/update persists immediately, while selection, clearing, and project logo
settings stay in the browser draft until Save & Continue.

The recap is built in two runs: a SCRIPT run creates the narration timeline, and
a RENDER processes the full source independently. Each timestamped Burmese-story
block becomes one narration beat (`lib/movie-recap-manual-script.ts`). The script
run downloads the source only to detect embedded letterbox bars; it does no scene
detection, keyframe extraction, vision description, scene-based text splitting,
or spare-footage planning.

Building that script is its own run (`lib/movie-recap-script.ts`,
`POST movie-recaps/:id/script`), and it stops before anything is cut. It speaks
every beat through the selected provider in `lib/tts/`, caches each
content-addressed beat, then stores a combined `narration.wav` and JSON beat
boundaries in R2. Narration is the master audio timeline. Every beat uses the
fixed 1.0x post-synthesis narration rate;
source duration never changes it. Picture follows each resulting beat duration:
it uses a 0.75x baseline, slows shortage beats to the configured minimum and
speeds surplus beats up to 1.1x, then trims or freezes whatever is left. Editing and choosing **Re Build
this beat** re-synthesizes only that beat (`POST movie-recaps/:id/script/beat`),
replaces its section in the existing master, and shifts later timing boundaries
by the duration delta. A missing, incompatible, or invalid master falls back to
a bounded-parallel rebuild from raw caches. Raw provider-output duration is
stored per beat so unchanged audio does not need measuring again; video speed is
absent from both audio cache keys. Each saved beat has an inline playable preview from
`POST movie-recaps/:id/script/beat/preview`; it reuses the raw beat cache and
applies the same configured overall narration rate as the master. There is no
manual whole-master rebuild: a beat Re Build splices or fully rebuilds the
master, and render materializes it if missing. Multiple beat Re Build clicks
queue in the browser and run one at a time so each write uses the latest saved
script and narration master. **Resync with Main Script** alone
replaces beats from the Transcript story. Starting one beat preview continues through
the following saved beats; while one plays, the next three configured-speed WAVs
are prepared concurrently and kept as browser object URLs for smooth handoff.

With `RECAP_JOB_RUNNER=github`, the script and render routes claim the row and
dispatch `.github/workflows/recap-job.yml` instead of running in-process
(`lib/recap-job-dispatch.ts` → `scripts/recap-job.ts`); the wizard's row poller
follows the run either way.

The render (`lib/movie-recap-render.ts`) is then ffmpeg. The shared timeline
planner samples each narration beat in a configurable 3 source seconds retained
/ 1 source second skipped cadence. It uses 0.75x as the picture baseline, may
slow a shortage beat to the configured minimum or speed a surplus beat up to
1.1x, then trims or freezes only that
beat to its narration duration. Footage is never borrowed across beats.
Captions follow the cached narration beat timings, and the final MP4 is built
from the same beat-fitted footage-only frames plus the narration track.
video stream ends, or selected footage may continue silently after narration
ends. Source audio is muted;
mirroring and held-frame motion happen per clip, while captions, blur regions
and the logo are overlaid after concatenation and therefore remain unmirrored.
Long captions are split across the planned clip slots. A mock render skips TTS
and comes out silent. Each render also returns a per-shot
log (slot, source range, held-frame seconds), which the Review step keeps per
project in the browser's localStorage (`lib/movie-recap-render-history.ts`) — it
is not stored server-side.

A completed render persists three R2 artifacts on `movie_recap_projects`: the
combined MP4, the processed footage-only MP4, and the cached narration master
WAV. Review plays and downloads the combined MP4; the other artifacts remain
internal. Download GETs validate project access through RLS, then return
short-lived R2 URLs with attachment filenames; large media bytes do not pass
through the Next server.

Review can also render an inclusive start/end beat range as a standalone MP4.
It reuses the saved narration master, trims audio at the selected beat
boundaries, and renders only those beats with captions rebased to zero. These
outputs live in `movie_recap_range_renders` and R2, separate from the full
render columns. Full and range renders share one project render claim, progress,
and cancellation. Timeline mismatches continue to export and persist a warning
with the output for Review. Mock Preview remains independent of the Full/Range selector.

The Review step also has a **Render Silent Timing Test** diagnostic. It bypasses
the script and processes the complete original source as one continuous cadence:
3 source seconds retained, 1 skipped, retained frames played at fixed 0.75x,
original audio removed, and the final partial cycle trimmed to the probed source
duration. It uses the normal render status, cancellation, R2 output and player,
and replaces the current preview output without changing narration caches.

The Narrative Script step also has **Rebuild Scene Timing Plan**. It reads the
saved beats and cached beat timings, plans one video scene per narration beat,
and returns the same shared beat-level trim/freeze plan used by preview and
final render. It never resyncs the script, calls TTS, or changes saved beat text.

The wizard is Add Source -> Transcript -> Narrative Script -> Customize Video ->
Review. The Narrative Script step owns everything about the beats: building them,
reading narration timing, and editing a line. Only its **Resync with
Script** button goes back to the transcript and rebuilds from scratch — every
other action reads the stored beats, which is what makes an edit cost one beat.
Project name, output language and voice moved into Customize Video as its first
section; there is no separate settings step.

Video Cutter (`/video-cutter`, `components/video-cutter/VideoCutter.tsx`) is a
browser-only, lossless trim tool for preparing recap sources: it uses
ffmpeg.wasm with stream copy, and nothing is uploaded or stored.

The Transcript step's Burmese story is always typed or pasted by the user. The
source transcript (`transcript_text`) has two modes: Recap Video (paste, import,
or Audio mode — the same read with `dialogueOnly`, speech only, no scenes)
and Raw Video to Recap, which calls `POST movie-recaps/:id/transcript`
(`lib/movie-recap-transcript.ts`): subtitle track or Whisper for dialogue, plus
PySceneDetect + a vision pass (`lib/movie-recap-scenes.ts`) for one `[Scene]`
line per detected scene, merged into timestamped lines and written to
`transcript_text`. Raw Video to Recap then works story-first: a copied script prompt
yields an untimed Burmese recap script (`transcript_script`), and a copied clip
prompt turns it into the timestamped story. The texts are saved via `PATCH movie-recaps/:id`
(`components/movie-recap/MovieRecapTranscript.tsx`). The AI Burmese retelling
(`storyOnly`) is still parked.

A finished render leaves its script on the row (`render_script`) and everything
the planner derived from the source — spare scenes, cuts, motion — in R2
(`render_analysis_key`). The Review step lists the script line by line
(`components/movie-recap/MovieRecapScript.tsx`); editing a line and re-rendering
(`POST movie-recaps/:id/render` with `reuse`) skips detection, the vision pass,
the split pass and transcription, and runs TTS and ffmpeg on the words as
written. Only the text is patchable — the shots under a beat are already the
finished cut.

### Translate

- UI: `app/(app)/(translate)/translate/` and `components/translate/`
- API: `app/api/(translate)/translate-projects/`
- Storage: `translate_projects` and project-scoped Cloudflare R2 objects

Each user owns Translate projects under their own per-user feature gate.
A project stores the original video in R2 through resumable multipart upload,
a small JPEG cover captured from its first frame or the editor's current playhead frame,
the supplied original-language SRT in Postgres, optional speech-aligned subtitle parts,
an optional imported translated SRT, the active timing mode (original, synced, or translated), and up to eight normalized blur regions plus subtitle
vertical position and size. Video replacement uploads to a separate R2 object
and switches the source only after completion; saved subtitle work is retained.
The cover is stored in project-scoped R2 and shown on list cards; cards without one show an icon.
The Customize preview follows the uploaded video's dimensions. Users drag or
resize blur areas and adjust subtitle height with a slider; subtitles stay
centered. Auto sync transcribes source audio with word timestamps, splits
original-language SRT cues into sentences or short clauses, and matches each part
to nearby transcript words even when the supplied cue is early or late. A local
pause and punctuation fallback can time a cue when text matching fails. The timed
speech transcript is cached in project-scoped R2 per source video; unmatched cues retain
their original timing. Users can switch between original and synced timing without
discarding either; an explicit delete removes synced timing. The server downloads the original video, burns the blur
and selected subtitle timing with ffmpeg/libass, and saves an MP4 back to R2.

### Recap V2

- UI: `app/(app)/(recap-v2)/recap-v2/` and `components/recap-v2/RecapV2Editor.tsx`
- API: `app/api/(recap-v2)/recap-v2-projects/`
- Storage: `recap_v2_projects` (gated by `movie_recap`) and `recap-v2/<id>/` in R2

A Chinese-narrated recap video becomes a Burmese-narrated one. **Transcribe**
(`lib/recap-v2-transcribe.ts`) reads the speech with the FunASR worker's
character timestamps and `buildRecapV2Units()` cuts it into ~4.2s units whose
picture windows tile the whole source; units live as JSONB on the row, and the
raw speech transcript is kept in R2 so `…/resplit` can rebuild units for free.
**Translate** (`lib/recap-v2-translate.ts`) builds a story memory, then
translates ID-locked batches with OpenAI; each line stays editable. **Render**
(`lib/recap-v2-render.ts`) synthesizes each line through `lib/tts/` (raw clip
cached by content in R2), optionally trims its edge silence ("Short pauses"),
retimes each window's picture to its line (max 1.25×, then the window's tail
is cut; frame-locked to the cumulative narration clock), applies source-frame blur and
Movie Recap's `buildShotFilter` look, concatenates, burns captions, and muxes.
All three share one job slot (`job_*` columns) that the editor polls.

### Transcript

- UI: `app/(app)/(transcript)/transcript/` and `components/transcript/TranscriptEditor.tsx`
- API: `app/api/(transcript)/transcript-projects/`
- Storage: `transcript_projects` (gated by `movie_recap`) and `transcripts/<id>/` in R2
- Worker: `workers/whisper-mm/` (Whisper large-v3 on Modal, `lib/transcript-worker.ts`)

A Burmese video uploads to R2 (same multipart flow as Recap V2); Transcribe
extracts Opus audio and sends it to the Whisper worker; the segments become
plain text (`transcript_text`), shown in a Transcript tab with copy and .txt
download. No timestamps are kept.

### Burmese Voice Lab

- UI: `app/(app)/labs/voice/`
- API proxy: `app/api/labs/voice/`
- Worker: `workers/voice-lab/` (deployed to Modal scale-to-zero GPU via `modal_app.py`)

The authenticated lab keeps a saved list of Burmese lines (`voice_lab_items`):
Import splits pasted text into one editable row per line. Generate renders the
unfinished lines with the chosen voice through the TTS layer (`lib/tts/`). Azure
voices are rendered by the route; VoxCPM2 lines go to the worker as one job that
uploads each WAV to R2 via presigned URLs and reports back to
`app/api/labs/voice/callback`. The page polls the rows. `TTS_AZURE_KEY` and
`VOICE_LAB_WORKER_URL` stay server-only; `VOICE_LAB_WORKER_TOKEN` also
authenticates the callback. See `history/voice-lab.md`.
If job acceptance times out during a Modal cold start, rows remain processing;
polling recovers completed WAVs from R2 or eventually marks stale rows failed.

Wai Yan, Yuzana, and the Voice Lab-only `ပညာရှိအဘိုး` / `ဓမ္မသံ ၁` / `ဓမ္မသံ ၃` profiles use fixed
16 kHz reference WAVs bundled into the worker runtime. The server sends a
reference ID and exact transcript; the worker maps that ID to its local WAV
path and passes only the requested narration text to VoxCPM2.

### Text to speech

- Contract and voice catalog: `lib/tts/types.ts`, `lib/tts/voices.ts`
- Voice previews: static audio in `public/movie-recap/voices/`; Azure MP3s are
  generated from the catalog, while Wai Yan and Yuzana play their supplied WAVs.
  `app/api/voices/preview/` remains the fallback when a profile has no file
- Providers: `lib/tts/providers/azure.ts`, `lib/tts/providers/voxcpm.ts`
- Entry point: `lib/tts/synthesize.ts`

One catalog holds every voice; each entry names its provider and carries that
provider's own parameters (Azure voice name and SSML prosody, or VoxCPM2 style
prompt and seed). `synthesize()` picks the provider off the voice, so callers —
the lab route and the render pipeline — never name a service. A voice's `id` is
what the database stores, so moving a voice between providers is a code edit.
`surfaces` decides where a voice is offered: Movie Recap and the lab share four
Burmese voices, while the three story narration profiles are available only in Voice Lab.

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

Every extracted asset starts as `new`. There is no story-wide asset store:
each chapter's assets stand alone (the Asset Bible was removed — see
`history/asset-bible-removal.md`).

Extraction fills a `storyAnalysis` (scene → place map, place groupings,
character arcs) before any asset; it is logged, not stored. A character whose
appearance changes lastingly gets `looks` (jsonb on `chapter_assets`): IDENTITY LOCK in `real_prompt` holds the shared traits, each
look its own appearance and wardrobe and its own sheet copy
(`lib/character-looks.ts`). Storyboard shots pick a look in
`assets_used[].look`; uploaded renders carry `chapter_images.look_key`.
A recurring nameless collective (devas, hell beings) is one `character` row with
`is_group`; it copies with the group sheet preset instead of the
single-person turnaround.

Locations use structured `STRUCTURE SHELL`, `FIXED LAYOUT`, optional `VIEWS`,
and `SPATIAL RULES`. One physical place is merged during extraction. Location
reference images are URL-only and chapter-scoped. Characters and props currently have no reference-image rows.

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
on `chapters.site_map` (`lib/site-map.ts` parses and renders it). Each place in
it lists camera stations (`reference` = the location reference image's own
position, plus any reverse or raised view the shots need); every shot names its
station in `assets_used[].station`, and the storyboard's Camera plates panel
copies and stores one empty plate per extra station (`chapter_images.station_key`). Every shot stores its
beat, duration, aspect, camera, framing scale, motion mode, image prompt, video
prompt, assets used, and start/end continuity state. Each scene also stores a `lighting` line
shared by its shots, composed into copied prompts rather than baked into them. Duration is clamped to 1–10 seconds. The
model's motion mode passes through `resolveMotionMode()` (`lib/motion.ts`),
which clamps it to a mode the story's motion style allows and reconciles it
with whether the video prompt quotes a spoken line.

User edits are stored in `prompt_override`, `video_prompt_override`, and
`sound_prompt_override`; the generated originals remain intact. Clearing an
override restores the original.

When the story's format is `cozy-asmr`, `lib/prompts/storyboard-asmr.ts` is
appended to the storyboard prompt (full and single-scene) and every shot also
gets a `sound_prompt` (foley plus ambience), shown and copied separately in the
Video tab. Cinematic stories get the unchanged prompt and no sound.

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

### Story transfer between accounts

- Bundle format + rebuild: `lib/story-transfer.ts`
- Export: `GET /api/stories/:id/export`
- Import: `POST /api/stories/import`
- UI: `components/StoryTransfer.tsx` (Story options menu, Stories header)

Export returns the story and every chapter (script, site map,
chapter assets, scenes, shots, Voice Over segments) as ordinary JSON, which the
browser saves as a `.storybook.json` file. Import parses a picked file, posts it
back, and inserts the whole tree as a new story owned by the signed-in user.
Database ids never travel: Voice Over ranges reference `{ sceneIndex, shotIndex }`, remapped during import. Uploaded
chapter images (R2 objects) are deliberately excluded — see
`history/story-transfer.md`.

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
  -> profiles.id (1:1, per-user feature access)
  -> stories.owner_id
       -> chapters.story_id
            -> chapter_assets.chapter_id
                 -> chapter_asset_images.chapter_asset_id
            -> scenes.chapter_id
                 -> shots.scene_id
            -> voice_over_segments.chapter_id
            -> prompt_lab_runs.chapter_id (also owner_id -> auth.users)

auth.users
  -> movie_recap_projects.owner_id
       -> movie_recap_range_renders.project_id
  -> translate_projects.owner_id

voice_over_segments.start_shot_id / end_shot_id -> shots.id
```

| Table | Responsibility |
|---|---|
| `profiles` | Mirrored email, admin flag, and one feature-access boolean per gated feature |
| `stories` | Ownership, title, description, style slug, motion style slug, format, region, aspect, soft delete |
| `chapters` | Episode order, Tiptap script, workflow status, aspect override, storyboard site map |
| `chapter_assets` | Chapter-local extracted asset, prompt, looks, and stale state |
| `chapter_images` | Externally generated renders uploaded to R2, per chapter |
| `chapter_asset_images` | Chapter-scoped location reference image URLs |
| `scenes` | Ordered storyboard scenes and their lighting line |
| `shots` | Ordered prompts (image, video, optional sound), overrides, references, beat, framing scale, motion mode, and continuity state |
| `voice_over_segments` | Anonymous narration snapshots, overrides, and inclusive shot ranges |
| `prompt_lab_runs` | Prompt Lab sandbox runs (storyboard or asset extraction): prompts as sent, model, context, raw/parsed output, usage, optional source asset run |
| `movie_recap_projects` | Recap source metadata, resumable upload state, configuration, and readiness |
| `movie_recap_range_renders` | Saved output and beat bounds for standalone range renders |
| `translate_projects` | Owned source upload, SRT, blur/subtitle settings, and rendered MP4 |

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
extraction, chapter-local character-info and prompt editing,
location reference-image URLs, storyboard
generation, editable/restorable shot prompts, style/region selection,
story-wide motion style with a per-shot motion mode override, per-scene
storyboard regeneration, and
story/chapter aspect ratios, cross-account story export/import as a JSON file,
and a per-chapter gallery of externally generated
images uploaded to R2 and ordered by file name. Anonymous Voice Over blocks are mapped to editable
storyboard shot ranges as a separate narration overlay. The UI ships a dark and a
light theme, chosen by the user in the account menu (dark by default, OS
preference deliberately ignored).

Movie Recap projects support resumable source upload, playable preview,
persisted settings/customization, transcript/script/render processing, full
and saved beat-range video outputs, and output history.

Translate projects persist a replaceable source video, original-language SRT, selectable
original, speech-aligned, or imported translated timing, editable blur and subtitle placement, and a
rendered MP4. A project exports to a JSON file (everything but the video and render) that New project imports alongside a re-uploaded video.

Accounts are created and deleted by an administrator at `/admin`, which also
grants each account its Stories, Movie Recap, Translate, and Voice Lab access; deleting an
account removes its R2 objects before the account itself. Admin is
`profiles.is_admin`, granted from the same page; `ADMIN_EMAILS` remains as a
break-glass override.

Current intentional limits: no OAuth, magic link, password-reset flow,
database style editor, or character/prop reference images. Uploaded chapter
images go to Cloudflare R2 (presigned PUT straight from the browser); the
location/character reference-image rows remain URL-only and unrelated to it. The `demo/` directory is reference-only.

## Decision-history index

| Feature | Decision record |
|---|---|
| Asset extraction, sync, props, location merging | `history/asset-extraction.md` |
| Character looks (per-stage sheets) | `history/character-looks.md` |
| Camera stations and plates | `history/camera-stations.md` |
| Prompt-hint tooltip behavior | `history/prompt-hint-tooltip.md` |
| Visual styles and regional text | `history/visual-styles.md` |
| Story regions and cultural/historical adaptation | `history/regions.md` |
| Voice Over blocks, mapping, and range editing | `history/voice-over.md` |
| Motion styles and per-shot motion modes | `history/motion-styles.md` |
| Story formats (Cozy POV ASMR) and sound prompts | `history/story-formats.md` |
| Per-scene storyboard regeneration | `history/storyboard-scene-regeneration.md` |
| Chapter site map fed into shot generation | `history/storyboard-site-map.md` |
| Copied-prompt order, style position, scene lighting | `history/shot-prompt-composition.md` |
| Shot prompts holding the location reference | `history/shot-location-consistency.md` |
| Chapter image gallery and R2 uploads | `history/chapter-images.md` |
| Movie Recap phase-one projects and uploads | `history/movie-recap.md` |
| Translated SRT projects and rendering | `history/translate.md` |
| Per-user feature access and the admin user manager | `history/admin-users.md` |
| Story export/import bundle format | `history/story-transfer.md` |
| Burmese self-hosted narration experiments | `history/voice-lab.md` |
| Light/dark theming and color tokens | `history/theming.md` |
| Documentation ownership and maintenance | `history/project-documentation.md` |

## Maintenance rule

Update this document when a change moves a feature's main files, changes a
request/data flow, adds or removes a table relationship, or materially changes
the implemented product surface. Keep implementation details in code and
decision reasoning in `history/`; this file should remain a fast orientation
map rather than a second specification.
