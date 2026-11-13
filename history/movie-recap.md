# Movie Recap

Covers: `app/(app)/(movie-recap)/movie-recap/**`,
`app/api/(movie-recap)/movie-recaps/**`, `components/movie-recap/**`,
`lib/constants/movie-recap.ts`, `lib/movie-recap.ts`,
`lib/movie-recap-render.ts`, `lib/movie-recap-episode.ts`, `lib/movie-recap-episode-target.ts`, `lib/prompts/movie-recap-narration.ts`,
`lib/r2.ts`, `lib/facebook.ts`, `lib/constants/facebook.ts`, `app/api/facebook/**`, `app/api/(movie-recap)/movie-recap-social-posts/**`, `components/ui/FacebookLogo.tsx`, `lib/spoosh.ts`, `lib/tts/**`, `lib/recap-job-dispatch.ts`,
`scripts/recap-job.ts`, `.github/workflows/recap-job.yml`, and the `movie_recap_projects`,
`movie_recap_range_renders`, `movie_recap_episodes` and `movie_recap_social_posts` migrations.

## 2026-11-13 — Voice is chosen at Narrative Script

**Decision, approved by the user:** the voice picker moves from under the
Burmese story (Transcript) to the top of Narrative Script, beside the
Normal / Episode tabs. A change is saved at once (PATCH `voiceProfileId`), not
with Continue, because Build script and Re-voice in the same step read it from
the row. Each beat now records `voiceId`, the voice it was last spoken with; the
script header shows that voice, and when it differs from the project's a notice
offers Re-voice.

**Why:** the voice only matters to Build / Re Build / Re-voice, which all live in
Narrative Script, and arriving there gave no sign of which voice was set — worse
with episodes, each its own script. The 2026-09-22 reason (choose before Build)
still holds with the picker next to Build.

**Consequences:**
- The voice is project-wide: Normal and every episode share it, and each script
  needs its own Re-voice after a change.
- A single beat Re Build after a voice change rebuilds the master in the new
  voice, so every beat of that script is marked with the new voice.
- Render always speaks with the project's current voice; the notice is a
  warning, not a gate.
- Scripts built before this have no `voiceId`: no voice is shown and no notice
  appears until they are rebuilt or re-voiced.

**Supersedes:** 2026-09-22 "Narration voice is chosen with the Burmese story"
(placement only; Male/Female presentation was already replaced by the shared
VoicePicker).

## 2026-11-13 — Auto read asks Chinese or Other: FunASR or self-hosted Whisper

**Decision, by the user:** both automatic reads (Recap Video's Auto-generate and
Raw Video's Read source) open a dialog asking what language is spoken.
**Chinese** uses FunASR on Modal (`ASR_WORKER_URL`), as before. **Other** uses
the self-hosted Whisper large-v3 worker (`workers/whisper-mm`,
`WHISPER_MM_WORKER_URL`) with the language auto-detected. The choice is per
read and not stored. A usable subtitle track in the source is still read first
whichever is chosen.

**Why:** FunASR Paraformer-zh only understands Chinese; non-Chinese films had
no working recognizer.

**Rejected:** OpenAI `whisper-1` for Other — paid, and the 2026-10-01 "no
OpenAI fallback" rule stands. Each choice fails with its own "not configured"
error rather than falling back to the other worker.

**Consequence:** `transcript_source` still says `"whisper"` for either worker.

## 2026-11-13 — Episode mode replaces range render

**Decision, requested by the user:** the Review Full/Range selector and the
beat-range render are removed. Narrative Script instead has a **Normal /
Episode** mode. An episode is a named, inclusive range of Transcript-story beats
(chosen by beat number in a modal) that builds its **own** narration script:
beat edits, Re Build, previews and Resync act on the episode only and never on
the Normal script. Each episode keeps **one** output video; rendering again
replaces it and deletes the old object. Customize is unchanged and shared.
Review picks Default or an episode to render.

**Why:** range render was not used in practice. It sliced the Normal script's
master, so a range could not have its own wording or narration; an episode is
what a range was standing in for.

**How it runs:** an episode run borrows the project's `script_*` / `render_*`
columns as its claim and progress (the pattern range render used), so one run
per project, the existing poller and the GitHub Actions path all still hold.
The route snapshots those columns before the claim; the run restores them at the
end and writes the outcome to the episode row. Queued (Actions) runs send the
snapshot as the `previous` input with `episode_id`. An episode build does not
download the source: the letterbox crop is source-wide, and a render without one
measures it.

**Rejected:** cloning the project per episode (Customize would diverge and the
shared source object would be at risk on delete); episodes with their own
progress columns (a second poller and progress source for no gain).

**Consequences a reader may mistake for bugs:**
- While any episode run is going, the Normal view shows the script/render as
  running too — it is the project's one claim.
- Re Build on an episode beat never deletes the superseded narration master.
  Masters are content-addressed under the project, so an episode's old master
  can be the Normal script's or another episode's current one. Some R2 objects
  leak; that was preferred to deleting live audio.
- Episode beat numbers are fixed at creation. Editing the Transcript story later
  can shift what those numbers point at; Resync re-reads the range as numbered
  then, and fails if the story no longer has that many beats.
- `movie_recap_range_renders` and its R2 videos were left in place on purpose
  (user's choice); no code reads them.
- The workflow is dispatched against `main`, so episode runs on Actions need the
  updated `recap-job.yml` pushed first.

**Supersedes:** 2026-09-25 "Review can render an inclusive beat range
separately", "Refresh range results on user actions", the localStorage Full/Range
selection, and the 2026-09-29 Range-selector layout entries.

## 2026-11-13 — Narration numbers are spelled out in Burmese words

**Decision, approved by the user:** the shared `NARRATION_WORDING` rule (used by
the copied translation prompt and the other narration prompts) now says to write
every number as Burmese words, never digits: `သုံးနှစ်`, not `၃ နှစ်`;
`တစ်ထောင့်ကိုးရာကိုးဆယ့်ကိုး ခုနှစ်`, not `၁၉၉၉`. Codes read digit by digit
stay digit by digit, in words (`007 → သုညသုညခုနစ်`). Timestamps are untouched.

**Why:** a translation came back with `၃ နှစ်`. With digits, the TTS model has to
guess how to say the number, and voices can read it differently; with words it
reads exactly what is written. The old example (`80,000 feet → ပေ ၈သောင်း`)
still left a digit in, so digits did not look wrong to the model. This agrees
with the earlier finding that `နှစ်ယောက် → ၂ ယောက်` flattened the narrator.

**Supersedes:** the 2026-09-22 "spoken forms for quantities" rule and its
`ပေ ၈သောင်း` example, along with its exemption that kept codes and identifiers
in exact numeric form.

**Consequence:** spelled-out lines have more characters for the same speech.
Character-based duration estimates treat digits as short, so words make them
more accurate, not less.

## 2026-11-12 — Dissolve over each cadence skip

**Decision, chosen by the user:** the 3-on/1-off cadence stays (2026-09-21).
Each clip that follows a forward skip opens with a 0.2s `xfade` dissolve
(`MOVIE_RECAP_CUT_CROSSFADE_S`) from a tail: source starting at the previous
clip's end, played at the previous clip's speed. The cut first continues the
previous motion, then dissolves into the next clip.

**Why:** the 1-second skip read as a jump cut every 3 seconds. The dissolve sits
inside the next segment and is trimmed to its own frame count, so segment
lengths, the timing plan, captions and `concat -c copy` are unchanged.

**Rejected:** making the skip optional (would reopen the 2026-09-19 toggle
removal and the 2026-09-21 cadence); shortening the skip to 0.5s; aligning skips
to the film's own cuts (most work); `xfade` across segments at concat time (it
shortens the timeline by the overlap and needs one graph over hundreds of
inputs).

**Consequence:** the first 0.2s after a skip show up to ~0.23 source seconds of
the skipped second, blended. That is the dissolve, not a cadence bug. No dissolve
on the first clip, a backward jump, a skip shorter than the tail, or a slot of
12 frames or less. The silent timing diagnostic still uses the hard `select`
cut.

## 2026-11-12 — apt install fails fast and retries

**Decision, requested by the user:** "Install ffmpeg" runs `apt-get update` with
`APT::Update::Error-Mode=any`, wraps update + install in a 3-attempt retry with
backoff, limits each install to 300s with `timeout`, and caps the step at 15
minutes.

**Why:** a run hit a runner DNS failure (`Temporary failure resolving
'azure.archive.ubuntu.com'`). By default apt only warns on that, so install ran
against stale indexes, stalled ~46 minutes on `security.ubuntu.com`, then looped
"Tried to start delayed item … but failed" until the log was truncated. The job
timeout of 300 minutes was the only limit.

**Consequence:** a network failure now fails the step within minutes, and
"Mark row failed" runs, instead of hanging. "apt attempt N failed" on stderr
followed by success is normal, not a bug.

## 2026-11-11 — Quieter runner logs, one step per stage

**Decision, requested by the user:** `recap-job.yml` splits setup into
"Install npm dependencies", "Install ffmpeg", "Install Myanmar fonts" and
"Check ffmpeg filters and encoders", and the job into one step per `kind`
(`if: inputs.kind == ...`). `apt-get` runs `-qq` with stdout to `/dev/null`;
`npm ci` runs `--no-audit --no-fund --loglevel=error`.

**Why:** the logs were too large to read; apt alone printed hundreds of lines.

**Consequence:** apt errors still reach stderr and fail the step, but a
successful install prints nothing. The two run steps that don't match `kind`
show as skipped. That is expected. "Mark row failed" still runs on any failure.

## 2026-11-11 — Re-voice the existing script

**Decision, requested by the user:** the Script step's ⋯ menu gets "Re-voice
with <current voice>" above "Resync with Main Script". It calls
`POST movie-recaps/:id/script` with `{ revoice: true }`: `runMovieRecapScript`
keeps every beat of `render_script` (text, edits, shots, groups,
`originalText`) and only speaks it again with the project's current voice,
re-measuring `rawAudioS` / `audioS` and the narration master. No source
download, no story re-parse, and `render_analysis_key` is kept. It clears
`audioStale`. The GitHub runner gets a `revoice` workflow input
(`scripts/recap-job.ts script <id> --revoice`).

**Why:** after changing the voice the user wants new narration and timings
without losing edited beats, which Resync would rebuild from the story.

**Consequence:** a new voice changes beat lengths, so overruns can appear or
disappear — the same check as after any re-measure. The workflow input must
exist on the dispatched ref (`main`) before production can dispatch it.

## 2026-11-11 — Transcript source: mode column + one row of actions

**Decision, requested by the user:** the mode switch and the source actions
share one box. Left column (`bg-sunken`): a Select with "Recap Video" /
"Raw Video to Recap" (was a button pair). Right column (`bg-panel-2`): Recap Video shows
`Get Transcript ▾ › Import .txt  OR  Auto-generate from video`; Raw Video to
Recap shows Read source with a one-line hint. No "Manual"/"Auto" group labels —
the buttons say what they do, and "or" separates the two sources. Card
descriptions moved to button tooltips. Progress and errors show under the row.

**Why:** the two cards took a lot of height for three buttons.

**Supersedes:** "Layout: Import and Audio mode are two separate cards" and the
"Generate Transcript" button label from the 2026-10-04 entry. The two sources
stay visibly separate ("or"), which was that entry's reason.

## 2026-11-11 — Narration voice uses the shared picker

**Decision, requested by the user:** the Transcript step's "Narration voice"
grid is replaced by the shared `components/voice/VoicePicker.tsx` (see
`history/voice-lab.md` 2026-11-11). Still on the Transcript step (2026-09-22)
and every voice can still be played (Thiha and Nilar from their static MP3s).
Selection now goes through a dialog with a "Use voice" confirm.

## 2026-11-10 — Wizard steps and Back/Continue stay fixed; only the step body scrolls

**Decision, requested by the user:** the wizard no longer uses the shared
`Body` scroller. It is a flex column: the step tabs (top) and the Back/Continue
bar (bottom) are `shrink-0`, and only the middle step content is
`flex-1 overflow-auto`.

**Why:** on long steps (Script with hundreds of beats) Back/Continue sat at the
very bottom of the page and was out of reach.

**Rejected:** `sticky` header/footer inside `Body` — the whole page would still
scroll and the scrollbar would run behind the bars.

**Consequence:** the Script beat auto-scroll (`scrollIntoView`) now scrolls the
middle region, not the page. On small screens the two fixed bars take more of
the height; the step-tab grid wraps to three rows there.

## 2026-11-10 — Full renders schedule to the Facebook Page as Reels

**Decision, approved by the user:** Review's full render gets a **Publish to
social** button (admins only, not on mock previews) beside Download in the Full
video header that asks for a caption and a publish time and calls
`POST movie-recaps/:id/facebook` (`lib/facebook.ts`). Every recap goes out as a
Reel whatever its aspect ratio — the user chose that over picking Reel vs.
regular video by ratio. Range renders do not get the button.

**Why:** one click from the finished render to a scheduled post on the user's
own Page. The Page token (`FB_PAGE_ID`, `FB_PAGE_TOKEN`) is a single
never-expiring Page token for one Page, which is why the route is admin-only on
top of RLS: any user with Movie Recap access could otherwise post to that Page.

**How:** Reels Publishing API start → hosted-file upload → finish with
`video_state=SCHEDULED`. Meta pulls the MP4 from a presigned R2 URL that lives
an hour (the browser download one lives five minutes, too short for Meta's
fetch), so the bytes never pass through Next.

**Composer:** the dialog mimics a Facebook post composer — Page name and
avatar (`GET facebook/page`), caption, removable hashtag chips, GeckoUI
`DateInput` plus a 15-minute time `Select`, and a live preview with the render.
Defaults live in `lib/constants/facebook.ts` (user's choice over a DB setting or
`.env`): the next 8:00 PM that is at least ten minutes away, and the default
hashtags. Changing a default is a code change.

**Facebook logo — approved exception to the lucide-only icon rule:** the user
asked for the composer to read as Facebook at a glance. lucide 1.x ships no
brand logos, so `components/ui/FacebookLogo.tsx` inlines the Simple Icons (CC0)
"f" mark as a badge on the Page avatar. Its colour is
the `facebook` / `on-facebook` tokens, the same Meta blue in both palettes
because the brand colour does not change with theme. Rejected: a plain
"Facebook · Reel" text chip (stays inside the rule, but does not read as
Facebook). This exception covers brand marks only; UI icons stay lucide.

**Accepted consequences:** Meta enforces the Reel limits (length, ratio) and the
scheduling window; its error message is shown as is. Only the ten-minute minimum
lead is checked locally.

**Superseded the same day (see "Scheduled posts are stored and managed"):**
this entry first stored nothing about the post — the toast and Meta Business
Suite were the only record, and scheduling twice made two posts.

## 2026-11-10 — Scheduled posts are stored and managed

**Decision, approved by the user:** every scheduled Reel is saved in
`movie_recap_social_posts` (project, Facebook video id, caption, publish time,
status, permalink). The Full video card lists them for admins with Edit
(caption and time, `PATCH movie-recap-social-posts/:id`), Cancel (deletes the
video on Facebook, then marks the row cancelled) and a link once published.
Scheduling a recap that already has a scheduled or published post shows a
warning but still allows it.

**Why:** with nothing stored, the app could not show what was scheduled, and a
second click silently posted twice. The user wanted to keep managing posts here
rather than in Meta Business Suite.

**How status stays current:** `GET movie-recaps/:id/social-posts` re-reads every
`scheduled` row from the Graph API (`status`, `permalink_url`) and writes back
published/failed. A lookup that errors leaves the row unchanged — a token or
network hiccup must not mark a live post cancelled. There is no background
sync; a row only updates when someone opens the list.

**Traps:** if the Facebook schedule succeeds but the row insert fails, the route
answers 500 with a message saying not to schedule again — the Reel is live on
Facebook and a retry would duplicate it. Editing the time uses the Video node's
`scheduled_publish_time`; whether Meta accepts that for Reels was not verified
against a real post when this shipped. If it is refused, the Graph error is shown
and the fallback is Cancel + schedule again. Deleting a recap project cascades
its rows but leaves the Facebook posts in place.

**Rejected:** a background job polling Facebook (no scheduler exists in this
app, and the list is the only place the status is read).

## 2026-11-10 — Video render card is one toolbar row

**Decision, approved by the user:** the Video render card has no heading — the
user found it self-evident. One wrapping row holds the Full/Range select, the Start/End beat selects (Range only), the render action
and the more menu on one wrapping row, with `p-3` padding. The visible field
labels ("Render selection", "Start beat", "End beat") are gone; each select
keeps its name as a hover title.

**Why:** the card took three rows (heading, labels, controls) for one select and
one button. The selects already show their value, so the labels repeated it.

**Kept from earlier entries:** the render action still sits directly after its
selectors (2026-09-29 "Align render actions"), the three Range selectors stay
together, Mock Preview stays in the more menu, and progress stays its own
section. **Supersedes** the grid with fixed selector columns from "Keep range
selectors together": the beat selects are now fixed-width (`w-56`) items in a
row that wraps on narrow screens instead of holding a minimum width.

**Rejected:** merging the render controls into the Full video card header — it
would undo "Separate Review progress from render controls"' separate section.

## 2026-11-05 — The poller reads progress columns, not the whole row

**Decision, approved by the user:** the wizard's tick reads
`GET movie-recaps/:id/progress` (status, stage and counters only). When a status
differs from local state it fetches `GET movie-recaps/:id` once and adopts that.
Polling itself stays, per the 2026-09-15 "via polling not SSE" entry. The user
also asked for a slower tick: 10 seconds, down from 2 (360 requests an hour per
open tab, not 1,800). The transcript's partial-progress write slowed with it, to
every 9 seconds.

**Why:** the full row carries the transcript, story and narration manifest, and
went out 1,800 times an hour per open tab. On Vercel Hobby that spends the 10 GB
Fast Origin Transfer allowance, and a row stuck on "running" keeps spending it for
as long as the tab stays open. Requests count against their own 1M allowance
however small the response is, which is what the slower tick addresses. Older
entries that say "2s" or "every two seconds" describe the interval of their day.

**Rejected:** merging status from the tick and the outcome later. The outcome
toasts fire when status leaves "running" and read the error from the same state,
so status has to land together with the full row.

**Consequences:** progress on screen can lag the row by up to 10 seconds, and the
outcome toast can arrive that much after a queued run settles.
`render_script` written mid-render (narration timings) reaches the browser when
the run settles, not during it. A failed full-row fetch leaves
the status on "running", so the next tick tries again. A column the UI needs
during a run must be added to the progress route and `MovieRecapProgress`.

## 2026-10-17 — Script and render can run on GitHub Actions

**Decision, by the user:** the narration build (script) and the full, mock and
range renders run on GitHub Actions when `RECAP_JOB_RUNNER=github`
(`lib/recap-job-dispatch.ts`, `.github/workflows/recap-job.yml`,
`scripts/recap-job.ts`). The route claims the row exactly as before, dispatches
`workflow_dispatch`, and returns the still-"running" row; the wizard's existing
2-second poller shows progress and toasts the outcome when the row settles.
Unset, everything still runs in-process.

**Why:** neither the local machine nor free hosting can carry these runs — free
hosts cap function time (`maxDuration = 300`) and have no libass ffmpeg or
Myanmar fonts (see the 2026-09-27 Vercel entry), and a local render ties up the
laptop. A runner gets ffmpeg + fonts per job and up to 6 hours.

**Rejected:** a DB-backed job queue with a polling worker — needs an always-on
host, which is the thing that is missing. Storing the render log server-side so
queued renders can still append to browser history — it is browser-only on
purpose; for queued runs it lives only in the Actions log.

**Consequences:**
- Cancel needs no change: both pipelines already re-read their status and stop
  when it is no longer "running", so the in-memory `AbortController` map simply
  never finds a remote run and the row write does the work.
- A range render restores the project's pre-claim render columns. The runner
  only ever sees the claimed row, so the route sends that snapshot as a
  workflow input (`previous`); losing it would leave the row at "running".
- A killed runner (timeout, cancelled in the Actions tab) never reaches the
  pipeline's catch; the workflow's `if: failure() || cancelled()` step marks the
  row failed, guarded on it still being "running".
- Runs take ~30–60s to start. Beat Re Build and beat previews stay on the app
  server.

## 2026-10-09 — GPT-5.6 models moved to GPT-6

**Decision, by the user:** every `gpt-5.6-luna` call is now `gpt-6-luna` and
every `gpt-5.6-sol` call is `gpt-6-sol` (all in `lib/openai.ts` and
`lib/recap-v2-translate.ts`). Both were checked against the account's model
list and accept strict JSON-schema Chat Completions. The Luna/Sol split stays:
Sol for Burmese prose, Luna for structured passes. `gpt-5.4-mini` (Movie
Recap vision/split) is unchanged: it is not a 5.6 model and was chosen for the
free tier. Output quality on the new models has not been re-reviewed.

## 2026-10-04 — 9:16 watermark text 1.9% -> 1.3%

**Decision, by the user:** 9:16 watermark text read large at 1.9% of frame
height (~36px at 1920). It is now 1.3% (~25px). 16:9 (1.5%) and 1:1 (1.9%) are
unchanged. Preview and render share `MOVIE_RECAP_WATERMARK.sizePct`.

## 2026-10-04 — Recap Video mode has an Audio mode read

**Decision, by the user:** the mode tabs are renamed "Recap Video" (was
Manual) and "Raw Video to Recap" (was Auto). Recap Video gets an "Audio mode"
button beside Import. The uploaded video is already a recap with its own
narration, so the button only transcribes that speech into the source
transcript, as `MM:SS text` lines.

- It is the same `POST movie-recaps/:id/transcript` run with
  `dialogueOnly: true`: captions or FunASR, with no scene detection and no
  vision pass. Scene lines would add nothing to a source that is already cut.
- `movie_recap_projects.transcript_dialogue_only` records it. The stepper shows
  Scenes as skipped, and a reload during or after the run stays on Recap Video
  instead of opening Raw Video to Recap.
- **One line per stamp (by the user):** FunASR splits at commas, so two
  segments often land on the same second (`00:02 结果回家后，` /
  `00:02 丈夫竟…`). `buildAutoSourceTranscript` joins consecutive dialogue
  lines with the same stamp, with no space after CJK text. `[Scene]` lines are
  never joined, so the tag keeps its own line. This applies to Raw Video to
  Recap's read too.
- **The translation prompt joins lines that share a stamp (approved by the
  user; amends "Manual mode's translation prompt is back to exactly its
  pre-Auto text").** STEP 1 re-splits into sentences, so two sentences
  starting in the same second got the same stamp again, and
  `parseTimestampedBlocks` silently drops a block whose stamp is not after the
  previous one. New STEP 1 rule 5: join such lines, use each stamp once.
- **Labels (by the user):** the cards are titled "Manual transcript" (import)
  and "Auto transcript" (this read). Its button is "Generate Transcript".
- **Layout (by the user):** Import and Audio mode are two separate cards, side
  by side on desktop, not one row joined by "or". They are two different
  sources.
  *(Superseded 2026-11-11 — one row of actions split by "or", see top.)*
- **Helper links are one "Get Transcript" dropdown (by the user, supersedes
  "Center Transcript import beside helper links" below):** the YouTube and
  RedNote items open their sites in a new tab. The chevron and Import button
  follow it.

## 2026-10-03 — Recap length is chosen per project, recommended by source length

**Decision, by the user:** Auto mode has a "Recap" dropdown next to "Copy
script prompt". It replaces the fixed 22–26% budget. The options are:

- **Recommended:** a share that follows the source's length:
  `1.1 × √(source minutes)` minutes of recap. That is ~28% at 15 min, ~22% at
  25 min, ~14% at 1 h, and ~10% at 2 h (`lib/movie-recap-recap-length.ts`). It is capped at 30%: below about 13 minutes the
  curve climbs further (53% at 4 min), which is no longer a recap.
- **Presets:** 10 / 15 / 20 / 25 / 30%. A preset within 2.5 points of the
  recommendation is hidden, so the same choice never appears twice.
- **Custom:** a dialog that takes a % (3–60), shows the resulting minutes, and
  then appears in the menu with an edit button. There is only one custom
  value; editing replaces it.

Each option shows the narration time for this video, not just the %. The
prompt budget is the chosen share ±10%.

**Why a square-root curve, not a fixed %:** recap channels run 5–12 minutes
for a 90–120 minute film (~5–12%), while 12–15% of a 25-minute source read as
events rushing past, and 22–26% suited it. A fixed % that fits short sources
would give a 2-hour film a ~29-minute recap.

**Storage:** the project's choice is `movie_recap_projects.recap_share`
(numeric, null = Recommended), saved with the other Transcript fields. The
custom value is a per-browser preference in localStorage
(`movie-recap:custom-recap-share`). It only pre-fills Custom on new projects;
a project saved with a custom value shows it on any browser.

**Limitation:** the prompt guides the length but cannot enforce it. A script
can still land ±15–20% off the target.

## 2026-10-04 — Recap line count uses 6s per line, wording keeps 10s

**Decision, by the user:** the script prompt's line count is computed at 6s per
line, not 10s. A 6:05 source at 40% (menu showed ~2:26) came back as 1:34 of
narration. Lines written to the "about 10 seconds" wording measure ~6s when
read aloud in Burmese.

- **Only the count changed.** The per-line wording ("one sentence of about
  10 seconds", the shorten/merge rules) and the timing prompt's 10s timestamp
  gap stay at 10s. Telling the model "6 seconds" would make it write shorter
  lines, which would undershoot again.
- **The line count is now the constraint the model checks, not total reading
  time.** The old prompt said "the TOTAL reading time is the limit" and the
  final review checked the total. The model estimates time with its own rate,
  so it cut lines it thought ran over. The prompt now says the count is already
  calibrated and must be met; the target minutes stay as context only.
- **Supersedes** the "10s per line is the user's measured average" note in the
  2026-10-01 auto-mode entry below for the count. The menu needed no change: it
  shows the share × source duration, which the count now aims at.

## 2026-10-01 — Transcript step has Manual and Auto source transcripts

**Decision, by the user:** the Transcript step offers two modes for the source
transcript. Manual is the existing paste/import flow. Auto re-enables the parked
`POST movie-recaps/:id/transcript` read and extends it with scene analysis.
Dialogue comes from the source's subtitle track or Whisper. PySceneDetect then
detects scenes, and the existing three-keyframe vision pass describes each one.
Both are merged into `MM:SS text` lines in `transcript_text`, with scene lines
tagged `[Scene]`. Auto never writes the Burmese story: the user still produces
it with the copied translation prompt.

**Why not have Auto write the Burmese story too:** the parked retelling writes
untimed prose, and Build Script needs one timestamped line per beat. A timed
Burmese pass would be a new prompt with its own cost; the user chose to keep the
existing translator flow.

**Why scenes are interleaved with dialogue:** a film's dialogue alone is what
characters say, not what a recap narrator describes. Scene lines give the
translator the on-screen action. The translation prompt now keeps `[Scene]`
lines as their own lines (they are not sound tags). It narrates their action,
and when scene lines are present, it retells the other lines as dialogue instead
of quoting them.

**Does not reverse "Build Script prepares audio, not picture selection"
(2026-09-21):** scene analysis runs here only to write source text. Build Script
and the render still never detect or describe scenes.

**Consequences:**
- An Auto run overwrites the source transcript on the row, after a confirm when
  the field is not empty. While it runs, the wizard keeps the user's unsaved
  Burmese story and voice draft instead of adopting the polled row's.
- The run is synchronous with `maxDuration = 300`, like Build Script.
  PySceneDetect plus the vision pass over a feature-length film can exceed that
  on a host that enforces it.
- The stepper shows Source / Dialogue / Scenes, with Burmese story struck
  through as skipped. A `storyOnly` retell (still not reachable from the UI)
  skips the first three instead.
- PySceneDetect must be installed (`.venv-scenedetect`, see README); without
  it, Auto fails at the Scenes step and shows the error.

**Update, same day: the Auto scene pass is its own vision call**
(`describeMovieRecapTranscriptScenes`, `lib/prompts/movie-recap-transcript-vision.ts`).
The render-era `describeMovieRecapScenes` prompt is left unchanged. The new pass
differs in three ways:
- **Empty descriptions are allowed.** Shot/reverse-shot conversations produced a
  `[Scene]` line per cut that said only that someone was talking. The model now
  returns an empty visual for a scene that adds nothing to the previous one, and
  empty lines are dropped. Batches run sequentially and carry the last non-empty
  description forward for that comparison.
- **A cast list carries across batches.** Every batch receives the cast so far
  and returns it updated, so a recurring person keeps one label ("Man A") for the
  whole film instead of being "a man" in every scene. The translation prompt
  tells the translator never to say the label, and to use the real name once the
  dialogue reveals it.
- **The dialogue under each scene is sent as context** (clipped to 400
  characters), so the model can tell who is speaking. The prompt still forbids
  summarizing it or guessing plot. The render-era reason stands: a vision pass
  that invents plot poisons what is written from it.

`peakFrame` is not requested. Timestamps stay at the scene start, which the user
did not ask to change.

**Update, same day: Auto mode is two prompts, story first (supersedes the
condensed recap prompt below, approved by the user).** One prompt that selected
moments, condensed them, held timestamps, obeyed timing rules and translated
kept growing rules that contradicted each other. For example, a coverage rule
about the window up to the next timestamp disagreed with how the render
actually takes footage, and "keep the ending" disagreed with sources that are
only part of a story. Recap channels work the other way round: narration
first, then footage to match.

- **Prompt A, "Copy script prompt"** (`buildRecapScriptPrompt`): writes the
  Burmese recap from the transcript with no timestamps. It carries the 12–15%
  length budget, story priorities, an open-thread rule (do not invent an ending
  for a partial source), and story-order lines.
- **Prompt B, "Copy clip prompt"** (`buildRecapClipPrompt`): takes the
  transcript and the script and returns `MM:SS  line`. Each timestamp is
  copied from the transcript, with `[Scene]` lines preferred. Lines are never
  reworded. Timestamps strictly increase and are at least 10s apart, and none
  is reused. Both prompts embed everything they need, so B does not depend on
  being sent in the same chat as A.
- **Why strictly increasing:** `parseTimestampedBlocks` skips any block whose
  timestamp is not after the previous one. A non-monotonic answer would
  silently lose lines.
- **Why 10s apart:** a beat's window ends at the next timestamp, and a short
  window under a ~10s line is slowed with no floor (see "No slow-down floor").
  Changing the render to take footage from the timestamp for the narration's
  length, regardless of the next stamp, would remove both rules. It was not
  done; revisit if the clip prompt struggles to obey them.
- **The script is stored** in `transcript_script` (new column). It appears as a
  "Recap script" box in Auto mode, saved with the other Transcript fields. The
  render and Build Script do not read it. Only the timestamped Burmese story
  drives them.
- Manual mode's translation prompt is back to exactly its pre-Auto text. The
  style, wording and style-reference blocks are shared constants, so the three
  prompts keep one voice.

**Update, same day: budget raised again to 22–26% (by the user, "a little
more"),** after 18–22% below.

**Update, same day: budget raised from 12–15% to 18–22% of the source (by the
user).** At 12–15%, the rendered recap's events felt rushed: about 20 lines
for 25 minutes, so each line stood for about 75s of film. The user's target
is a 15-minute film to about a 3-minute recap (~20%). The prompt still aims
for the middle of the range.

**Update, same day: FINAL REVIEW protects the stakes line (wording by the
user).** A review found that the story's "why" was gone: the company was close
to bankruptcy, so the auction was its only chance. Without that line the
ending's win carried no weight. FINAL REVIEW item 1 now never removes the line
that sets up the main character's goal or what they stand to lose.
Deliberately minimal: a writing-time "stakes, setups and payoffs" rule
and a two-way setup/payoff check were considered and held back until a test
shows that stakes or setups (such as an offer that pays off later) are still
missing from the draft.

**Update, same day: second review of the script (wording by the user).**
- **"Same moment" is defined as one continuous action within about 10s of film
  time,** in rule 4 and in FINAL REVIEW item 3. "Same place" was read
  loosely: lines still joined moments 20–50s apart in one room.
- **The hook line must describe something visible near the end** (the rival
  watching, a threatening look). A narrator-only comment ("the villains are
  still close by") had no shot for the clip step to match.
- **Uncertain identity:** the transcript is machine-made and has no speaker
  labels. A line's speaker or a person's relationship ("二叔" could be the
  father himself) can be wrong. When it is not clear, the script describes
  the person by what is certain instead of guessing. FunASR has no speaker
  diarization in this setup. Adding it (`spk_model`) is the code-side fix if
  this keeps coming up.

**Update, same day: no repeated beats, and a final review (wording by the
user).** An outside review of the first script found a third display of the
same power, two near-identical threats, and suggested merges. Prompt A now:
- **Rule 8:** for the same kind of event, keep the first time and the
  strongest or most important later time. Drop the rest.
- **FINAL REVIEW:** always drop repeats and side details. Drop other lines
  weakest first, only while the total stays at or above the budget minimum.
  If it falls under, add back a skipped story moment, never filler. Shorten
  long lines by cutting words, not moments. Never merge two lines; drop the
  weaker one unless both happen in the same place at the same time.
- **Every rule and example stays genre-neutral,** because the feature takes
  any film. The earlier example ("drinks the water … the auction") came from
  the test film and was replaced with a generic one.

**Update, same day: script prompt tightened after the first real run** (25:20
source). The script came back at 23 lines, the top of the 18–23 line budget.
Some lines ran 12–13s, so the total was about 4 minutes against a 3:02–3:48
target. Three changes to Prompt A:
- The total reading time is stated as the limit, not the line count: long
  lines mean fewer lines, aiming for the middle of the budget.
- **One line = one on-screen moment.** Lines had joined two scenes ("recovers
  after drinking water + is taken to the auction"), and a line plays over one
  clip, so the second scene could never be shown. Split into two lines or keep
  the more important one.
- **The last line:** end on the resolution if there is one. Otherwise end on
  the open threat as a hook for the next part. The first run's ending was weak
  because "do not invent an ending" alone gave it no target.

**Update, same day (SUPERSEDED same day — two prompts above): Auto mode copies a condensed recap prompt.** Manual mode
uploads a source that is already cut to recap length, so its prompt translates
every line. Auto mode reads a raw, uncut film, so its "Copy recap prompt" adds
a STEP 2 that keeps only the moments the story needs (setup, turning points,
reveals, climax, ending), drops filler, and prefers a `[Scene]` line as each
moment's anchor. The step also folds nearby dialogue into that line. The 1:1
rules then apply to the selected lines. The user's scene directive is changed
only to say "selected" in place of "cleaned".

- **Length is a ratio of the source, not fixed minutes (revised same day).**
  A fixed number of minutes would cut key moments from a longer film. The first
  version only asked for "a strict cut". On a 25:20 film it returned 115 lines,
  about 18–22 minutes of narration (70–80% of the source). The prompt now
  states a budget computed from `sourceDurationSeconds`: 12–15% of the film
  (25:20 gives about 3:02–3:48), converted to a line count at 10s per line, plus
  a final count-and-drop check. The 10s per line is the user's measured average
  for a translated Burmese line. It is deliberately not the codebase's TTS
  `CHARS_PER_SECOND`.
- **The render needed no change.** A beat's footage starts at its timestamp
  and runs only as long as its narration. Footage between selected moments
  therefore never appears, and the output length is roughly the narration's.
- **Accepted consequence:** a moment shows from its own timestamp onward. If
  the action peaks late in a long window, the payoff can be trimmed. Anchoring
  on `[Scene]` lines, which stamp the start of the action, keeps this small.
- The step opens in Auto mode when the saved source transcript contains
  `[Scene]`, so a reload does not switch it to the full-translation prompt.

**Update, same day: the copied prompt carries a strict scene-handling block,**
written by the user, placed just before the style reference. It says `[Scene]`
lines are visual actions to narrate, not dialogue. The tag must never be
output, and dialogue lines are retold without quote markers or "ဟုပြောသည်".
It replaces the one-line `[Scene]` narration rule added earlier today. The
cleaning rule (keep a `[Scene]` line on its own line) and the cast-label rule
stay, because the block does not cover them.

**Whisper segments are filtered** (`dropUnreliableSegments`) using Whisper's own
failure thresholds: compression ratio > 2.4, or no-speech probability > 0.6 with
average log-probability < -1. The second rule removes invented lines like "Thank
you for watching." over music or silence. `transcribeSource` is shared, so the
render's fallback read is filtered too.

## 2026-10-01 — Speech recognition moves from Whisper to FunASR Paraformer-zh (supersedes the Whisper worker below)

**Decision, by the user:** both Movie Recap transcription and Translate Auto Sync
use FunASR (`paraformer-zh` + `fsmn-vad` + `ct-punc`) on Modal
(`workers/funasr/modal_app.py`, env `ASR_WORKER_URL` / `ASR_WORKER_TOKEN`). The
Whisper worker and `workers/whisper` are removed. There is still no OpenAI
fallback.

**Why:** the sources are Chinese videos. Whisper's own benchmark puts
`large-v3` at 12.8% CER on Mandarin (Common Voice 15), and `turbo` is worse.
Whisper also mixes Traditional and Simplified characters, which breaks the
character matching against a Simplified SRT. On a test clip Paraformer
returned all 24 characters correctly, in Simplified, with a timestamp per
character.

**Constraints a later reader would otherwise "fix":**
- Models load from **ModelScope**, not Hugging Face. The HF `paraformer-zh`
  alias resolved to a model without a timestamp predictor, and generation
  failed with `KeyError: 'timestamp'`.
- The worker keeps the Whisper response shape (`segments`, and `words` with
  `?words=true`), so callers did not change. A "word" is one CJK character or
  one Latin word. It is paired with Paraformer's stamps after removing
  punctuation, and a count mismatch is logged rather than failing the request.
- FunASR sends no confidence fields, so `dropUnreliableSegments` passes every
  segment. The Whisper hallucination filter has nothing to act on.
- Paraformer-zh is a Mandarin model. English or other-language sources will
  transcribe poorly. That was accepted, because the user works with Chinese
  videos.
- Cold start, including the first model download, was measured at about
  2.5 minutes.
- `transcript_source` still stores `"whisper"` for a transcribed source. It is
  a column value constrained by the schema, not a label anyone reads.

## 2026-10-01 — Whisper runs self-hosted on Modal when configured (SUPERSEDED same day — FunASR above)

**Decision, by the user:** transcription uses open-source Whisper
(`openai-whisper`, `turbo` model) on Modal (`workers/whisper/modal_app.py`, T4,
one container, weights cached in the `whisper-cache` volume) when
`WHISPER_WORKER_URL` is set.

**Update, same day, by the user: no OpenAI fallback.** If the worker is not
configured, transcription throws instead of calling `whisper-1`, to avoid
unplanned API cost. This removes the 25MB upload check and its Opus-ceiling
reasoning from the 2026-09-17 entry. The Opus compression stays, so the POST
stays small. The source's own subtitle track is still read first, which costs
nothing.

- The worker returns the same `verbose_json` segment fields
  (`no_speech_prob`, `avg_logprob`, `compression_ratio`), so
  `dropUnreliableSegments` filters both paths the same way.
- It runs with `condition_on_previous_text=False`. Conditioning on its own
  output is how one invented line gets repeated across a quiet stretch.
- A long source runs past Modal's 150s HTTP window. Modal then answers with a
  303 to a result URL, and `fetch` follows it. The request is still bounded by
  the transcript route's `maxDuration`.
- A cold start loads the model before the first request is served. Measured at
  58s on a fresh container (first download included).

## 2026-10-01 — No slow-down floor and no freeze for short footage (records ea47837; supersedes the 0.65x/0.60x floor entries)

**Decision, confirmed by the user as final:** when a beat's footage is shorter
than its narration, the beat's speed is solved to whatever fills the narration
exactly (`buildMovieRecapSceneTimingPlan`). There is no minimum speed, and the
last frame is never frozen. `MOVIE_RECAP_MIN_PLAYBACK_SPEED` was removed in
ea47837, but no entry recorded it at the time. This entry records it.

**Consequence a later reader might "fix":** a short window under a long line
plays in very slow motion. A 5s window under 20s of narration plays at about
0.19x. This is accepted. Do not reintroduce a floor or a freeze without the
user's approval. The surplus side is unchanged: speed up to 1.1x, then trim.

## 2026-09-29 — Build script blocks without per-block database writes

**Decision:** turn timestamped story blocks into narration beats in memory, then report the completed Script stage once. Keep cancellation checks before and after the mapping.

**Why:** the mapping is synchronous and cheap; writing progress and checking run status through the database for every block made a 604-block script appear stuck around 93%, even though no expensive work was happening there.

**Rejected:** retaining a database round trip per block for a progress bar. Narration synthesis remains a separate, genuinely long counted stage; this change does not shorten TTS work.

## 2026-09-29 — Clean transcript sentences in the copied prompt

**Decision, approved by the user:** the copied translation prompt now asks the external translator to strip sound tags and speaker markers, join caption fragments into complete sentences, assign each sentence its first-word timestamp (or the next caption's timestamp when it begins at a caption's last one or two words), then produce exactly one Burmese narration line per cleaned sentence.

**Why:** raw auto-generated caption boundaries are not natural narration beats. Sentence-level cleaning provides complete spoken chunks while retaining timestamp synchronization and the established casual Burmese recap voice.

**Supersedes:** the 2026-09-22 strict preservation of every raw source timestamp and the 2026-09-28 relaxation that moved words across those raw lines. The new one-to-one rule applies to cleaned sentence lines instead. Sound-only lines disappear; several caption fragments may become one beat, and one caption may contribute to multiple beats. Only the copied prompt changes; transcript storage and rendering stay unchanged.

## 2026-09-29 — Restore subtitle visibility control

**Decision, approved by the user:** restore a Show subtitles switch in the Subtitle tab. It edits the existing `subtitlesEnabled` draft, which Save & Continue persists; preview and render already respect it.

**Why:** users need to produce a recap without burned-in subtitles, and the existing persisted setting had no UI control.

**Supersedes:** the 2026-09-22 decision to omit the Captions switch. Keep style and placement choices available even when subtitles are off, so re-enabling them retains those choices. No new setting or render path is needed.

## 2026-09-29 — Keep project order fixed by creation

**Decision:** list recap projects newest-created first, regardless of later edits or renders. Stories and Translate use the same list order.

**Why:** returning to work on an older project should not rearrange the project cards.

**Rejected:** ordering by last update. Card dates remain last-updated dates; only list order changes.

## 2026-09-29 — Show the whole project cover

**Decision:** display saved project-card covers with `object-contain` inside
the existing preview area.

**Why:** covers come from the video's own frame and should stay fully visible
even when their aspect ratio differs from the card. Cropping with `object-cover`
could cut off the subject.

**Rejected:** filling the card by cropping the cover. Empty space uses the
card's existing background.

## 2026-09-29 — Manual cover uses the Source playhead

**Decision, approved by the user:** `Set cover` captures the Source player's
current timeline frame. Keep the button available after a cover is saved so a
user can choose another frame. Automatic capture after a new upload still uses
the first frame.

**Why:** the opening frame may be black or an intro; the visible player already
lets the user choose the exact image they want for the project card.

**Rejected:** making manual Set cover always capture the first frame and hiding
the action after success, as recorded below. Remote sources seek to the chosen
time for capture; the existing cover stays if capture or save fails.

## 2026-09-29 — Cards without covers keep the icon

**Decision, requested by the user:** show the Clapperboard icon when a project
has no saved cover image. Do not mount its source video on the project list.

**Why:** the fallback video requests source bytes each time the list opens,
while the card only needs a lightweight placeholder until Set cover is used.

**Rejected:** the source-video fallback from the cover decision below; that
part of the earlier decision is superseded. Automatic cover capture and the
manual Set cover action stay.

## 2026-09-29 — Set covers for earlier uploads

**Decision:** show `Set cover` at the right of the Add Source heading when a
ready source has no saved cover. It captures the first frame from the existing
R2 video in the browser and saves it through the same cover route as a new
upload. The action disappears after success and stays available after failure.

**Why:** projects uploaded before automatic cover capture have no local file
available to the new-upload path; the fallback video on every list visit would
continue requesting source bytes. A one-time action stores a small JPEG instead.

**Rejected:** requiring the user to re-upload the movie just to create a cover.
The remote capture needs CORS-enabled source reads; it cache-busts the URL so a
previous non-CORS video response does not block canvas capture.

## 2026-09-29 — Restore a source-frame cover for project cards

**Decision, approved by the user:** after a source upload completes, capture
its first decoded frame in the browser as a small JPEG, store it under the
project's R2 prefix, and show it on the Movie Recap project card. Existing
projects without a stored cover display the source video's first frame in the
card. Replacing the source clears its old cover and saves a new one.

**Why:** the project list's generic icon does not identify the uploaded video.
Browser capture uses the selected local file, so Vercel does not need ffmpeg
or a second download of the movie.

**Rejected:** retaining the no-thumbnail decision from 2026-09-18. This cover
serves only project cards; it does not revive the Review thumbnail shuffle or
apply the render look. The first frame may be a black intro, as the old
thumbnail decision warned. A capture failure leaves the completed upload
usable and the card falls back to its source video frame.

## 2026-09-29 — Center Transcript import beside helper links (SUPERSEDED 2026-10-04 — one Get Transcript dropdown)

**Decision:** stack the YouTube and RedNote transcript links in one column and
center the chevron and Import button beside that column.

**Why:** both external helpers feed the same import action, so its position
should apply equally to either link rather than align with only the first.

**Rejected:** keeping the chevron and Import inline with the YouTube link.
The import parsing and save behavior are unchanged.

## 2026-09-29 — Replace video uses one same-video action

**Decision, approved by the user:** replace the two-item Replace video menu with
one button that uses the existing same-video replacement path. Keep its
confirmation, duration mismatch warning, and multipart upload flow.

**Why:** replacement files in this workflow are always better-quality copies
of the same cut, so asking which kind of video is being uploaded adds an
unneeded choice.

**Rejected:** keeping the Different video option in the UI. This supersedes
the two-item menu from the 2026-09-23 source replacement decision. The server
still accepts the legacy different-video mode; the UI no longer offers it.

## 2026-09-29 — Keep visited steps unlocked after returning to Narrative Script

**Decision:** persist the furthest visited wizard step in `max_step` while
`current_step` continues to record the step selected by navigation. Step tabs
unlock through `max_step`, and Different-video source replacement resets both
values to step one.

**Why:** returning from Customize to Narrative Script saved `current_step = 3`.
After a reload, the wizard treated that value as the furthest visited step and
disabled Customize and Review even though the user had already reached them.

**Rejected:** deriving the furthest step from `current_step` on every load;
that field also tracks backward navigation. Existing projects with a saved
render script are backfilled through Review because their previous maximum
cannot be reconstructed exactly.

## 2026-09-29 — Remove the floating beat player

**Decision, approved by the user:** remove the fixed bottom-right beat player
from the Script step. Keep each beat's inline play/pause button, active-beat
outline, automatic scroll during playback, and pause/resume behavior.

**Why:** the floating control duplicates the playback control in each beat and
occupies the page corner.

**Rejected:** retaining the floating player from the 2026-09-23 decision below.
That decision's player and scroll-to-top button are superseded; its other
playback behavior remains.

## 2026-09-29 — Shorten Review labels

**Decision:** call the Range action “Render Beats” and remove the explanatory
paragraph beneath Render history. Keep its columns, empty state, and Clear
action.

**Why:** the Range selectors already identify which beats will render, and the
history paragraph repeated details that do not need to occupy Review space.

## 2026-09-29 — Align render actions with their selectors

**Decision:** place Render Video beside the Full render-selection field in an
intrinsic-width grid column. In Range mode, keep the three selectors and place
Render Beats in a fourth intrinsic-width column on the same row.

**Why:** each action belongs beside the options it will use. Both buttons keep
their natural width instead of filling the remaining panel.

**Consequence:** no overflow-clipping wrapper surrounds the Range selectors,
so their dropdown menus remain visible. The row keeps its minimum width on
narrow screens.

## 2026-09-29 — Put Mock Preview in Review's more menu

**Decision:** move Render Mock Preview from the primary action row into a more
menu at the right side of the Video render heading. The menu item calls the same
mock-render action and stays unavailable while a render is running.

**Why:** Mock Preview is a secondary action independent of Full/Range selection;
beside Render Selected Beats it looked like another range-render choice.

**Consequence:** the output slot and current Full/Range view behavior remain
unchanged, including when Range is selected.

## 2026-09-29 — Keep range selectors together in Review

**Decision:** show Render selection, Start beat, and End beat in three equal
selector columns when Range is selected. The render action now occupies a
fourth column as recorded above.

**Why:** all three fields define one render range and are easier to scan and
adjust together.

**Consequence:** selected beat names stay on one line and truncate with an
ellipsis to fit their grid column. The dropdown retains the full beat text.
Start and End beat dropdown panels are capped at 24rem or the viewport width
minus 2rem, whichever is smaller; long option text wraps within the panel.
The action row does not repeat the selected beat numbers because the selectors
already show them.

## 2026-09-29 — Separate Review progress from render controls

**Decision:** remove the “Render preview” status row and explanatory sentence
from Review. Show the progress stepper in its own section after a render starts,
with the active stage or failure beneath it. Put Video render and its controls
in a separate section below.

**Why:** the heading and helper repeated what the stepper and controls already
showed, while nesting the controls inside the progress card blurred their roles.

**Consequence:** an idle Review opens directly on Video render; a finished
render shows its completed stepper above the controls without a separate “Done”
label. This supersedes the 2026-09-17 status-label placement, but retains its
active-stage detail and progress stepper. The stepper has no surrounding card,
padding, background, or border.

## 2026-09-29 — Download the combined Review video

**Decision:** add Download video under the Review player for the rendered MP4.
The authenticated project route signs the current combined output for a
short-lived attachment download. Mock previews use that same output slot.

**Why:** the player allowed watching the result but offered no way to save the
complete video.

**Consequence:** the 2026-09-22 decision to hide separate narration and
footage downloads still applies; this action downloads only what the player
shows. A previous completed output remains downloadable during a new render.
The download button is centered below the player.
It shows a loading state while requesting the signed URL, then lets the browser
handle the file transfer.

## 2026-09-29 — Let users adjust caption size in Customize

**Decision, approved by the user:** keep the two caption colour/outline presets
and add a per-project text-size override from 1% to 10% of output frame height.
An unset override uses the existing aspect-ratio default. Customize can restore
that default after a manual change; preview and ASS render resolve the same size.

**Why:** the aspect-ratio defaults remain useful starting points, but users need
to match caption scale to a particular video, as they already can in Translate.

**Rejected:** keeping size fixed inside the preset. The user explicitly asked
to change the 2026-09-16 fixed-size decision; retaining a fixed size prevents
this customization.

**Consequence:** existing projects retain their current size until adjusted.
The shared subtitle style also sizes the Hook Title overlay when present.

## 2026-09-27 — Static ffmpeg/ffprobe for beat audio preview on Vercel

**Decision:** When `FFMPEG_PATH` is unset, ffmpeg and ffprobe come from the `ffmpeg-static` and `ffprobe-static` packages. Only the beat preview route (`script/beat/preview`) traces the linux binaries into its function; other platforms' ffprobe builds are excluded from tracing.

**Why:** Vercel has no system ffmpeg, so preview failed with `spawn ffprobe ENOENT`. The user only needs audio preview on Vercel.

**Consequence:** Render, transcript, and Translate routes still have no ffmpeg on Vercel, and renders there would also lack the Noto Sans Myanmar subtitle font and hit function time limits. `FFMPEG_PATH` must not be set in Vercel's environment (a local macOS path would override the static build).

## 2026-09-25 — Export timeline mismatches with a warning (supersedes)

**Decision:** a concat frame mismatch no longer aborts a render. Extra frames
are trimmed to the narration length; missing frames are filled by holding the
last frame so the narration remains complete. If the mismatch exceeds two
frames, or its frame count cannot be measured, save a warning with the full or
range output and show it in Review as well as a completion toast.

**Why:** the earlier three-frame overrun discarded a 315-segment range render
after encoding was complete. The user prefers an export they can inspect over
losing the video at this final check.

**Supersedes:** the two-frame abort threshold retained in the frame-budget
decision below and the 2026-09-21 decision to fail a larger final mismatch.
Their frame-count diagnostics and exact scene budgets remain in place.

**Consequence:** a substantial shortfall can leave a visible held final frame
or imperfect sync. The saved warning identifies that output for review.

## 2026-09-25 — Keep each scene on its exact frame budget

**Decision:** divide each scene's narration-derived frame count among its shots
and assign any rounding remainder to the final shot. The two-frame failure
threshold retained here was superseded by the warning policy above. Timeline
diagnostics report requested versus actual frame counts without listing every
segment's MP4 duration.

**Why:** a 315-segment range render reached concat three frames longer than its
29,795-frame narration plan. Rounding shot boundaries independently can add
frames across a long render even though each scene has an exact target. The
per-scene budget preserves the narration wall and prevents this accumulation;
short diagnostics make any remaining encoder mismatch identifiable.

## 2026-09-25 — Remember the Review render mode per project

**Decision:** save the last Full/Range selection in browser localStorage under
the project ID and restore it when Review opens. Default to Full if no saved
selection is available.

**Why:** switching steps or reopening a project should return to the same video
section without requiring another selection. Storage failure does not prevent
manual selection.

## 2026-09-25 — Show three recent render records

**Decision:** Review displays the three newest browser-local render history
records. Older records remain stored and Clear still removes the full history.

**Why:** the table stays compact while showing the recent runs useful for
comparison.

## 2026-09-25 — Refresh range results on user actions

**Decision:** load range results when Review opens and refresh them after a
range render or deletion finishes. Do not force a refresh from a Review effect
that depends on the Spoosh trigger.

**Why:** the trigger can change identity across renders. Including it in the
effect dependencies caused repeated refreshes and a React maximum update depth
error. The render and delete actions already know when results need refreshing.

## 2026-09-25 — Review can render an inclusive beat range separately

**Decision:** Review offers a Full/Range selector. Full keeps the existing
complete render action; Range shows start and end beat selectors and renders
those beats into a separate saved MP4. Mock Preview stays outside this selector
and keeps its existing behavior. Its button sits beside the current render
action in both modes. Range controls use spacing without a top separator line.
The start and end beat selectors appear directly below the mode selector.
Mock Preview uses a muted violet outline to distinguish it from the primary
video render action.
The full or mock render player sits in its own card below the render controls,
matching the separate Range videos section.
Only the selected mode's video section is visible. Both sections stay mounted
when the mode changes, and playback in the hidden section pauses.
The full or mock video frame is centered within its card.
Range videos are displayed by ascending start beat, then end beat; repeated
spans show the newest render first.

**Why:** a user can inspect and download a small section with current video
customization without waiting for a complete render. The full output remains
available while the selected section is rendered and afterward.

**Consequences:** range renders reuse the stored script and cached narration
master, trim the audio to the selected beat timings, and rebase captions to the
new clip's zero point. Their output and beat span live in
`movie_recap_range_renders`, with the video under the project's R2 prefix.
Full and range renders share the project's one-at-a-time render claim and
progress/cancel controls. Deleting a range render removes its R2 object.

## 2026-09-24 — Reuse cached beat audio at 1.05x

**Decision:** assemble the narration master from existing beat audio at
`1.05x`. Keep Azure's synthesis rate unchanged, so the content-addressed beat
audio cache remains reusable; the changed master rate gets a distinct master
cache key and rebuilds the combined WAV and timing map.

**Why:** the user asked for a small narration speed increase and explicitly
chose reuse of existing beat audio over re-synthesis.

**Supersedes:** the 2026-09-24 decision to keep post-synthesis playback at
`1.0x` and, if needed, raise Azure's synthesis rate instead. That choice was
intended to avoid post-processing artifacts, but the user prefers the existing
cached audio to be sped up slightly.

## 2026-09-24 — Slow footage only as far as narration coverage needs

**Decision:** when a timestamped narration block is longer than its usable
footage at the baseline rate, calculate one slower speed for that block so its
footage covers the narration. Do not enforce a minimum speed or freeze-pad a
block that has positive usable footage. Keep a one-frame coverage margin for
frame rounding; the render trims to the narration duration.

**Why:** the user wants the footage to keep moving throughout the narrative,
with slow motion only where and to the degree the footage is short.

**Supersedes:** the 2026-09-24 `0.60x` shortage floor and its accepted freeze
consequence, and the earlier policy that stopped slowing and held frames when
a block's narration exceeded its footage.

**Consequence:** some blocks may play below `0.60x`; the slowdown is calculated
once per block, so the footage within that block keeps a consistent rate.

## 2026-09-24 — Recap project duplication removed (supersedes)

**Decision:** recap projects cannot be duplicated. The attempted duplicate
action and API were removed after the user reported that duplication failed.

**Why:** the feature did not work reliably enough to keep available.

**Supersedes:** the initial proposal to create an independent draft by copying
the source and optional logo into new project-scoped R2 objects, retaining
configuration and editable transcript/script content, and resetting processing
and render artifacts. That proposal aimed to prevent a copy's deletion or edits
from affecting the original, but the implementation failed in use.

## 2026-09-22 — Normalize pasted source transcript lines

**Decision:** source transcript paste/import keeps only lines that contain both
a timestamp and source text, normalizing each to one timestamped line.

**Why:** transcript websites can paste the source line together with a
translation line, or leave trailing standalone timestamps. Translation-only
and standalone timestamp lines are not useful to the source reference and
should not reach the recap workflow.

**Consequence:** source text pasted as a timestamp-only line followed by its
text is not reconstructed; the supported input format is timestamp plus source
text on the same line.

## 2026-09-22 — Preview omits the redundant uploaded-video label

**Decision:** the Movie Recap customization preview starts directly with the
video frame; it does not render an `Uploaded Video` heading.

**Why:** the preview's surrounding step UI already identifies the content, so
the extra label added vertical spacing without adding useful information.

## 2026-09-22 — Preview content is top-aligned

**Decision:** the Movie Recap customization preview content is aligned to the
top of its minimum-height container.

**Why:** the preview should begin near the step controls instead of vertically
centering the video and leaving an unnecessary empty area above it.

## 2026-09-22 — Customize form omits the redundant project heading

**Decision:** remove the standalone `Project` heading above the project-name
field in the Customize Video form.

**Why:** the form field label already identifies the project setting, so the
extra heading adds visual noise without clarifying the control group.

## 2026-09-22 — Logo settings can be saved and applied as immutable templates

**Decision:** the Logo tab offers `Save this template` and `Apply template`.
Saving asks for a name and snapshots the current logo file, enabled state,
placement, and opacity. Applying a template copies those values to the current
project; later edits affect only that project and never mutate the saved
template.

**Why:** recurring recap projects should not require re-uploading and
re-positioning the same brand mark, while a template must remain a stable preset
that can be reused unchanged.

**Consequence:** template logos use independent R2 objects. A project logo can
be replaced or removed without breaking a saved template, and applying a
template immediately stores its copied logo asset on the current project while
the user may still adjust placement or opacity before continuing.

Logo upload, removal, and template application merge only their logo fields
into the browser's current project draft. This preserves unsaved settings from
the other Customize tabs until the user explicitly continues or saves.

The Upload logo button shows a small preview of the currently selected logo;
before upload it keeps the upload icon.

The preview logo overlay sits above the video layer so the video element's
stacking order cannot hide it.

Apply template is placed above the Add Logo switch. Applying a template always
enables the logo overlay so the selected template is immediately visible in the
preview.

When a logo is present, the file picker is replaced by an icon-only close action;
upload becomes available again only after the current logo is removed.

The uploaded logo remains visible as a small thumbnail beside the close action,
and saving a template is kept as the final action below the logo controls.

Apply template now sits beside Save this template at the bottom of the Logo tab;
Save uses the primary button style and Apply uses the outlined primary style.

Both actions live outside the collapsible logo controls. Choose is always visible;
Save is shown only while Add Logo is enabled, and Save uses the secondary
outlined style while Choose uses primary.

The active template status is displayed on its own row below the action buttons
so the controls remain visually grouped.

The template chooser presents each saved logo as a selectable card with a
thumbnail, readable name, file name, placement/opacity badges, and a directional
hover cue instead of a plain text row.

Each card also has a separate delete action. Deleting is immediate inside the
chooser and refreshes the list; no nested confirmation dialog is used because
the chooser is already rendered in a dialog root.

Choosing a template enters editing mode. The save action becomes `Update
template` and replaces that template's independent logo asset/configuration;
newly saved templates enter that same editing mode immediately. `Clear` removes
the current project's logo and resets the watermark, placement, and opacity
inputs, then exits editing mode; it never deletes the saved template.

Logo placement uses a compact select control rather than four separate buttons
to keep the Logo tab smaller while retaining all four placement choices.

The logo contain box uses a `10% × 8%` width/height percentage budget
in both the browser preview and ffmpeg render, with the logo aligned by its
placement corner.

The chooser cards do not use a chevron affordance; their left/right padding is
balanced so the thumbnail, details, and delete action sit evenly in the row.

The Logo tab also has an optional Watermark text field. When filled, the text is
centered over the entire video frame in the customization preview and is included
when saving or applying a logo template.
It uses a subtle watermark treatment by default: small text, increased letter
spacing, and reduced opacity.

## 2026-09-22 — Customize design templates are local form presets

**Decision:** the Aspect panel offers an admin-defined `Facebook Reel` design
template. Applying it fills the current form with `1:1`, `contain`, and `1.10x`
zoom; it does not create or update an API resource.

**Why:** this is a convenience preset for completing the Customize form, not a
user-owned configuration entity. Keeping the preset code-defined makes its
values stable and prevents users from editing the template itself while still
allowing them to adjust the form after applying it.

**Consequence:** once a user changes any of the preset fields, the Select no
longer shows the template as active; the form values remain editable and are
saved through the existing Customize flow.

The Facebook Reel preset also turns dynamic background blur off, because its
square contain layout should keep the surrounding frame stable rather than
animate a blurred copy of the source behind it.

## 2026-09-22 — Hook title is an optional full-video overlay

**Decision:** Customize includes an optional Hook title text field with the same
top/middle/bottom positioning and edge-distance control as subtitles. A non-empty
title is rendered continuously from the first to the last video frame; an empty
title produces no overlay. It is not frame-timed or tied to narration cues.

**Why:** the hook is a persistent attention label for the whole video, so a
separate on/off switch and per-frame timing controls would add complexity
without matching the intended behavior. Reusing the subtitle style keeps the
overlay visually consistent.

**Consequence:** changing the hook title is part of the existing Customize save
payload and render configuration; older projects get an empty title by default.

## 2026-09-22 — Captions can be turned off

**Decision:** the Subtitle tab has a `Captions` switch, defaulting to on for
existing and new projects. Turning it off removes narration caption cues from
both the preview and the burned-in render; it does not affect the optional hook
title overlay.

**Why:** captions are a presentation choice separate from the narration and
hook title. The earlier always-styled decision kept the UI simple, but the user
now needs a clean video option without deleting the configured caption style.

**Supersedes:** the 2026-09-16 decision that styled burned-in subtitles were
the only mode and could not be disabled.

The Hook title controls stay outside the Aspect, Subtitle, and Blur tabs so the
persistent overlay remains independently discoverable and configurable.

The Hook title controls are currently hidden from the Customize UI temporarily;
the saved fields and render support remain intact for a later UI return.

## 2026-09-22 — Design presets use a card modal, not a select

**Decision:** the top-level Design template control opens a modal with cards.
Choosing a card applies the code-defined preset to the current Customize form;
Clear only removes the active-preset indicator and leaves the current form
values unchanged.

**Why:** these are one-click default configurations, not saved resources that
need a select field. A card can show the full preset summary and makes it clear
that applying it is an action, while clearing the indicator must not silently
undo values the user may already have edited.

**Supersedes:** the earlier decision that the preset should be offered through
a Select whose active state was inferred from matching form values.

## 2026-09-14 — Phase one is a resumable configuration project, not a render job (SUPERSEDED 2026-09-18 — the Generate button is removed; phase two shipped)

**Decision:** Movie Recap starts with a project dashboard and a persisted
four-step editor: source, settings, customization, and review. Clicking
Generate only marks the configuration `ready_for_generation`; phase one does
not manufacture a job, fake progress, or an output URL.

**Why:** the requested processing pipeline is explicitly phase two. A durable
ready state is the smallest honest handoff for that pipeline and lets users
reopen or edit the configuration now. Any later edit demotes the project back
to `draft`, so phase two cannot mistake stale settings for approved ones.

The one code-defined voice is `narrator`, with a stable preview at
`public/movie-recap/voices/narrator.mp3`. Output language is Burmese only.
Aspect ratio, subtitle mode, logo placement/opacity, and normalized blur
geometry live on the project row. (A deferred `copyright_free` boolean also
lived here originally; superseded 2026-09-15 — see below.)

## 2026-09-14 — Movie sources use R2 multipart upload with same-file reselection

**Decision:** videos upload browser-to-R2 in multipart chunks with three
workers. The database stores the active upload id; reopening lists completed
R2 parts, then asks the user to reselect a file with the same name, byte size,
and last-modified value. Failed parts receive a fresh signed URL and retry;
completed parts are not sent again.

**Why:** Cloudflare recommends multipart upload for video and other large
objects. Keeping the `File` itself across a browser restart would duplicate a
potentially huge movie into IndexedDB or depend on browser-specific file-handle
permissions. Reselection preserves server progress without either cost.

Upload progress uses `XMLHttpRequest.upload`; Fetch exposes no outbound upload
progress. Direct R2 requests are the same deliberate exception recorded for
chapter-image uploads: Spoosh owns calls to this app, not presigned third-party
storage URLs. App API calls still all use Spoosh.

**Accepted consequence:** the existing public R2 bucket was explicitly chosen
over a separate private bucket. Source and logo URLs are therefore public to
anyone who obtains them. Keys include project and random identifiers, but that
is obscurity, not authorization.

**Rejected:** one large PUT. It is simpler, but a network failure restarts the
whole movie and R2 recommends multipart for this workload. Also rejected:
persisting the video Blob in browser storage for transparent resume.

## 2026-09-14 — Preview edits are normalized configuration only

Aspect ratio changes the centered `object-cover` preview; subtitle mode shows a
fixed safe-area placeholder only for styled subtitles. Logo position uses four
corners. Blur is a normalized percentage rectangle clamped inside the selected
frame and supports pointer drag plus keyboard nudging. Actual crop, subtitle,
logo, blur, copyright transformation, and rendering remain phase two work.

GeckoUI 1.6.3 has no Slider. The opacity/width/height controls are an explicitly
approved narrow exception: accessible native range inputs styled with Tailwind
tokens. Other visible form controls remain GeckoUI components.

## 2026-09-15 — Upload failures are traceable without exposing upload grants

The browser upload flow emits structured console events prefixed with
`[MovieRecapUpload]` for file metadata, project/resume state, multipart sizing,
part attempts, retries, completion, and the final stopped reason. Logs include
part numbers and non-secret file metadata, but deliberately omit presigned R2
URLs and ETags because both are upload credentials or completion tokens.

## 2026-09-15 — 9:16 preview frame sizing bug, and a preview-only fit mode

**Bug fixed:** the 9:16 preview frame (`MovieRecapPreview.tsx`) applied
`w-full max-w-[620px]` and `max-h-[480px]` together regardless of orientation.
For 9:16, width was sized first (up to 620px), then `aspect-ratio: 9/16`
computed a ~1102px height, which `max-h-[480px]` then clipped without
shrinking width back down — producing a squashed, wrong-shaped frame instead
of a tall portrait one. Fixed by picking which dimension drives sizing based
on orientation: 9:16 uses a fixed `h-[480px]` with `w-auto` (height drives,
width derives from the ratio); 16:9 keeps the original `w-full max-w-[620px]`
with `h-auto` (width drives).

**Decision:** added a `fitMode` field (`cover` | `contain`, default `cover`)
on the project row, editable from the aspect-ratio tab, that only changes
whether the *preview* crops (`object-cover`) or letterboxes (`object-contain`)
the video inside the frame.

**Why:** the 2026-09-14 "Preview edits are normalized configuration only"
entry fixed the preview to a centered `object-cover` crop as phase-one scope,
with real crop/render behavior deferred to phase two. `fitMode` stays inside
that same boundary — it is still just a preview toggle, not a rendering
decision, so it does not pull phase-two work forward. Confirmed with the user
before building since it does expand what the phase-one preview does.

**Consequence:** `fitMode` is persisted and will need a real phase-two
rendering counterpart later (crop vs. letterbox in the actual output), but
that implementation is out of scope here — same as aspect ratio, subtitle
mode, logo, and blur already are.

## 2026-09-15 — Copyright-free transformation is mandatory, not optional (supersedes) (superseded 2026-09-16)

**Decision:** removed the `copyrightFree` toggle and its `copyright_free`
column entirely. Every project is now always treated as copyright-free;
there is no per-project choice.

**Why:** the 2026-09-14 phase-one decision explicitly recorded this as "the
deferred copyright-free boolean" — a deliberate optional per-project toggle.
The user asked to make it mandatory instead, which is a real reversal of that
choice, not a bug fix, so it was confirmed before implementing. Since every
project must always go through it, keeping a field that is always `true` (or
keeping a UI control that does nothing) would only be dead weight.

**Rejected:** keeping the DB column defaulted to `true` and just hiding the
UI control. Rejected because there is no scenario where the field is expected
to ever be `false` — a live but meaningless column and a value that can never
legitimately vary don't earn their keep in the schema.

**Consequence:** phase-two rendering must assume copyright-free transformation
always runs; it cannot read a per-project flag to skip it, because that flag
no longer exists.

## 2026-09-15 — Phase-two pipeline order and audio/video duration matching (design, not yet built)

**Decision:** phase-two render pipeline runs in this order:

1. AI reads source video (scene detection, dialogue/plot extraction).
2. Copyright-free transform on video only — freeze-frame, speed change,
   split/re-cut. Real source audio is dropped; our voice-over replaces it.
3. AI generates a narration script from step 1 ("ART file").
4. Narration script → TTS → voice-over audio (`narrator` voice profile).
5. Render: match final video segment durations to the locked narration audio,
   using a hybrid strategy — narration audio duration is authoritative;
   video segments are freeze/hold-padded or mildly speed-ramped (~5-15%) to
   fit each narration segment's window, with re-cut/re-split only when the
   mismatch is too large for freeze/speed alone.

**Why:** audio-driven duration matching (video conforms to narration, not the
reverse) fits recap style, where video is B-roll under narration. Pure
audio-driven (always freeze/hold) risks visually dead segments on large
mismatches; pure video-driven (always stretch/speed TTS to fit) distorts
narration pacing. Hybrid keeps normal-case segments untouched and only reaches
for the heavier fix (re-cut) when needed.

**Consequence:** this is a design decision for still-unbuilt phase-two
rendering, no code exists yet. It fixes the *order* (read → transform →
script → TTS → duration-matched render) and the *duration-matching strategy*
so a future implementer doesn't re-litigate them. Rejected alternatives:
strict audio-driven-only (dead freeze segments on big mismatches) and strict
video-driven-only (unnatural TTS speed distortion).

## 2026-09-15 — Phase-two-a: real render pipeline, TTS synthesis stubbed to console.log (superseded 2026-09-16)

**Decision:** built the actual pipeline (`lib/movie-recap-render.ts`, `POST
movie-recaps/:id/render`) instead of the phase-2 placeholder described above:
ffmpeg extracts the source audio, OpenAI Whisper transcribes it,
`generateMovieRecapNarration` (gpt-5.6-luna) writes a Burmese recap script
timed against the source video, and hybrid duration matching (speed-ramp
±15%, else freeze-pad or trim — see the entry above) renders a no-audio,
subtitle-track-only preview video. Every narration line is still generated
and logged (`[MovieRecapRender] ... TTS skipped, would synthesize: "..."`);
only the actual speech synthesis call is skipped, per explicit request to
keep this step visible rather than removing it, because generation is slow
and this phase is for testing the rest of the pipeline.

New project columns: `render_status`, `render_error`, `render_transcript`,
`render_script`, `render_output_url`/`render_output_object_key`,
`render_subtitle_url`/`render_subtitle_object_key`, `render_started_at`,
`render_completed_at`. New server helper `putObject` in `lib/r2.ts` — the
first R2 write that originates on the server rather than a presigned browser
upload, since the render output is generated server-side.

**Why estimated duration, not real audio:** with TTS skipped there is no
synthesized audio to measure, so each segment's spoken length is estimated
from word count (`WORDS_PER_SECOND_BURMESE = 2.3`) and used as the
duration-matching target instead. Swapping in real audio duration later is a
one-line change once TTS is wired up — the rest of the matching/render logic
doesn't change.

**Why subtitles are a WebVTT `<track>`, not burned into the video:** burning
Burmese text into video via ffmpeg's `subtitles`/`drawtext` filters depends on
a server-side font with Burmese glyph coverage and `libass` availability,
which isn't set up. A `<track>` element renders the browser's own font and
needs nothing from ffmpeg beyond the timestamps already being computed. This
applies to both `srt` and `styled` subtitle modes for now — a real burned-in
"styled" look (positioning, animation) is deferred; only "no subtitles" vs.
"has a subtitle track" is implemented today.

**Rejected:** true re-cut (choosing different footage) when a narration/video
duration mismatch is too extreme for freeze-pad or trim — logged as a
warning (`extreme duration mismatch`) instead of implemented, since it needs
its own clip-selection logic and is out of scope for this pass.

**Consequence:** `render_transcript`/`render_script` are real generated
data, not phase-2 placeholders — a future TTS integration reads
`render_script` for the exact text to synthesize per segment, and the
duration-matching math it should use is already implemented here, just with
an estimated duration in place of a measured one. The "Generate Recap Video"
button/`ready_for_generation` status is unchanged and unrelated to this
preview render.

## 2026-09-15 — Blur and logo are burned into the render preview too

**Decision:** the render pipeline now applies `blurEnabled`/`logoEnabled` to
the actual output, not just the customize-step client preview. Both apply
once, in a single ffmpeg pass over the whole concatenated video (`crop` +
`boxblur` composited back for blur; a scaled, opacity-adjusted logo image
`overlay`ed at the configured corner) — not per-segment, since both are a
fixed region/position for the entire recap, not something that changes shot
to shot.

**Why:** blur/logo were previously customize-step-only visuals with no real
counterpart in the output (same "preview edits are normalized configuration
only" gap the aspect-ratio/fit-mode entries above already covered for their
areas) — explicitly asked to close that gap for blur/logo now that a real
render pipeline exists.

**Consequence:** logo position/size math (`~18%` width, `4%` corner margin)
is duplicated between the CSS preview (`MovieRecapPreview.tsx`) and the
ffmpeg filter graph (`buildOverlayFilter` in `lib/movie-recap-render.ts`) —
there's no shared source of truth between a Tailwind layout and an ffmpeg
filter string, so if one changes, check the other.

## 2026-09-15 — Render-preview subtitle track styled to approximate the "styled" mode pill

**Decision:** the render-preview `<video>`'s `<track>` cues get a
Tailwind arbitrary `::cue` variant (`[&::cue]:bg-bg/80 [&::cue]:font-semibold
[&::cue]:text-fg`) when `subtitleMode === "styled"`, instead of the browser's
bare default caption styling.

**Why:** the step-3 customize preview shows a rounded, shadowed pill as a
mockup of "styled" subtitles, but the real `<track>` rendered plain
unstyled captions — a visible mismatch between preview and actual output.

**Rejected:** fully matching the pill (rounded corners, padding, drop
shadow). The WebVTT `::cue` pseudo-element only honors a narrow property set
— color, background-color, font, text-shadow, text-decoration — and ignores
border-radius/padding/box-shadow per spec, so an exact match isn't reachable
this way; burning subtitles into the video with ffmpeg's `subtitles`/`ass`
filter could get the exact look but needs a server-side Burmese-capable font
+ libass, deferred per the WebVTT-vs-burned-in decision above.

**Consequence:** this only affects the render-preview `<video>`; `srt` mode
still gets the browser's bare default caption styling (no override), which
matches that mode's "plain export" intent.

## 2026-09-15 — Real render progress, via polling not SSE

**Decision:** the render pipeline writes its current stage (`render_stage`:
`extracting_audio` → `transcribing` → `writing_script` →
`rendering_segments` with a live segment counter → `concatenating` →
`applying_overlays` → `uploading`) onto the project row as it runs
(`setProgress()` in `lib/movie-recap-render.ts`), cleared back to null on
completion or failure. The wizard polls `GET movie-recaps/:id` every 2s
while `renderStatus === "running"` and shows the current stage.

**Why polling, not SSE:** confirmed with the user — SSE would reintroduce
`@spoosh/transport-sse`, which was removed during the voice-lab "revert to
non-streaming" (see `history/voice-lab.md`). That case is not a precedent
against progress here: there, "real progress" broke because the underlying
model had to run in a fundamentally slower internal streaming mode just to
report it. Here, a DB row update between ffmpeg/OpenAI calls costs nothing —
the pipeline already has real, wall-clock-significant discrete stages, so
progress is free to report and polling is a plain HTTP GET, no new transport.

**Consequence:** progress lags real state by up to ~2s (poll interval), and
the render POST request itself still blocks for the whole pipeline exactly
as before — the poll only reads what that request is writing, it doesn't
change how the render itself runs.

## 2026-09-15 — Bug fixed: one narration segment produced one giant, striped subtitle cue

**Bug:** each `render_script` entry is a full recap sentence/paragraph —
correct for narration/TTS text — but the VTT builder turned one segment into
one subtitle cue verbatim. A long cue wraps across many lines in the
browser, and `::cue` backgrounds render per wrapped line (spec behavior, not
a bug in the styling itself — see the earlier "approximate the styled pill"
entry), so the result was several stacked boxes instead of one clean
caption, visibly different from the step-3 preview mockup.

**Fix:** `splitIntoCaptionChunks()` in `lib/movie-recap-render.ts` splits
each narration segment on Burmese sentence breaks (`။`), then further on
spaces if a "sentence" is still over ~40 chars, and each segment's estimated
duration is divided across its chunks proportionally by character length.
Only affects how subtitle cues are sliced — `render_script` (the text future
TTS will read) is untouched, still one entry per full narration segment.

## 2026-09-15 — Cancel a running render

**Decision:** added `POST movie-recaps/:id/render/cancel`. The render
pipeline creates an `AbortController` per run, keyed by project id in an
in-memory `Map` (`activeRenders` in `lib/movie-recap-render.ts`); cancel
looks up that id and calls `.abort()`. The signal is threaded into every
ffmpeg `execFile` call and both OpenAI calls (Whisper transcription, GPT
narration), so an abort actually kills the in-flight child process/request
instead of just giving up client-side. On abort, the row is marked
`render_status: "failed"`, `render_error: "Cancelled."` — there's no
separate "cancelled" status value.

**Why an in-memory map, not a DB-backed job/queue table:** this app runs as
one Node process (the whole deployment target here — see the "real render
progress" entry above making the same call for polling), so a plain module-
level `Map` is visible to both the render request and the cancel request
without any new infrastructure. It would NOT survive multiple server
instances or serverless isolates — noted as a real limit, not an oversight,
consistent with this feature's other "single-process, personal-scale"
choices.

**Consequence:** the Review step's "Render Preview" button also had to stop
relying on local `renderStatus` alone to know a render is running client-side
optimistically before the request resolves (added right before this — see
the render-progress entry) — cancel's availability (`renderStatus ===
"running"`) piggybacks on that same flag.

## 2026-09-15 — Cancel also self-heals a row orphaned by a process restart

**Bug:** a dev-server restart (hot-reload from an unrelated file edit, or any
process restart) wipes the in-memory `activeRenders` map without ever
reaching the render pipeline's own `catch`/`finally` — so the row is left at
`render_status: "running"` forever, and no future render can start
("A render is already in progress."). Hitting Cancel on that row correctly
found no live `AbortController` and reported `{ cancelled: false }`, leaving
the row stuck exactly as before.

**Fix:** the cancel route, when `cancelMovieRecapRender` finds nothing to
abort AND the row still says `running`, resets it directly
(`render_status: "failed"`, `render_error: "Cancelled."`) instead of just
reporting failure. Safe because "no controller for this id" in this
single-process app means nothing is actually running — there's no other
process that could still be holding it.

## 2026-09-15 — Mock render, logo geometry parity, and a real subtitle design

**Mock render.** `POST movie-recaps/:id/render` takes `{ mock: true }`. It
skips Whisper and the GPT narration pass and uses canned Burmese lines
(`MOVIE_RECAP_MOCK_NARRATION`) spread over the first
`MOVIE_RECAP_MOCK_SOURCE_SECONDS` (40s) of the source; everything after that —
segment rendering, duration matching, concat, blur/logo overlays, VTT, upload —
is the identical code path. `render_is_mock` records which kind of render
produced the current output, and the Review step has separate "Render Mock
Preview" and "Render AI Preview" buttons.

**Why:** design iteration on framing/logo/subtitles was paying for a Whisper
transcription plus a GPT script on every attempt, which made the visual work
too expensive to do properly. Mock keeps the expensive steps out and the
visual output real. **Rejected:** a client-only mock (fake output URL, no
ffmpeg) — it would not show the actual rendered frame, which is the whole
point.

**Logo geometry parity (bug).** The preview capped the logo at 18% frame width
*and* `max-h-16`, while `buildOverlayFilter` scaled to 18% width with `-1`
height and no cap — so a tall logo rendered visibly bigger than it previewed.
Both now use one shared box, `MOVIE_RECAP_LOGO_BOX` (18% width × 12% height,
4% margin), fitted with `force_original_aspect_ratio=decrease` on the ffmpeg
side and `object-contain` in a fixed percentage box on the CSS side. This
replaces the earlier entry's "the math is duplicated, check both" consequence
with a single exported constant.

**Subtitle design is now real configuration.** New columns:
`subtitle_font_size` (% of frame height), `subtitle_color`, `subtitle_bg_color`,
`subtitle_bg_opacity`, `subtitle_position` (bottom/middle/top),
`subtitle_offset` (% from that edge), `subtitle_bold`. The styled subtitle is
drawn as real DOM over the video by `MovieRecapSubtitleOverlay`, shared by the
step-3 preview and the Review player (`MovieRecapRenderPlayer`), so what is
configured is exactly what is shown in both. The VTT track still supplies
timing — it is switched to `mode = "hidden"` so the browser reports cues
without painting its own captions.

**Supersedes** the `::cue` styling entry above: `::cue` ignores padding,
border-radius and box-shadow, so it could only ever approximate the pill. Its
reasoning stands (that is why `::cue` was dropped), but the conclusion "an
exact match isn't reachable" applied to `::cue` only — a DOM overlay reaches it.

Sizes are percentages of frame height (rendered with container-query `cqh`
units) rather than pixels specifically so the same numbers can drive a future
burned-in render at any output resolution.

**Consequence — subtitles are still not burned into the exported MP4.** The
installed ffmpeg (8.1.1, Homebrew) is built without libass and without
libfreetype, so `subtitles`, `ass` and `drawtext` filters do not exist on this
machine; the design lives in the app's player only. Burning in needs an ffmpeg
with libass plus a Burmese-capable font passed to it (Pyidaungsu and Noto Sans
Myanmar are installed locally).

## 2026-09-15 — Styled subtitles are burned in with libass (ffmpeg-full)

**Decision:** styled subtitles are now rendered into the output file. The
pipeline writes an `.ass` file built from the same cues as the VTT
(`buildAss`) and applies it in the existing single overlay pass, between blur
and logo so the logo stays the topmost mark. The player draws nothing over the
video any more — what plays in Review is the exported frame. The WebVTT track
is kept and attached only in `srt` mode, where the subtitle is a separate
deliverable rather than part of the picture.

**Setup this requires:** Homebrew's `ffmpeg` formula no longer ships
libass/freetype (moved to the keg-only `ffmpeg-full`), which is why
`subtitles`/`ass`/`drawtext` were missing. `brew install ffmpeg-full`, and the
render pipeline reads `FFMPEG_PATH`
(`/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`) with `MOVIE_RECAP_SUBTITLE_FONT`
(default `Noto Sans Myanmar`, system-installed) for the face. Both are in
`.env`. Without `FFMPEG_PATH` the pipeline still runs on plain `ffmpeg` and
only the burn-in step fails — it is the one thing that needs libass.

**BorderStyle 3, not 4 (tested):** ASS mode 4 boxes each text run separately,
so a Burmese line rendered as a row of overlapping rounded blobs. Mode 3 draws
one box around the whole line, padded by `Outline` — the CSS pill. In mode 3
the box colour comes from `OutlineColour`, so the background colour/opacity is
written into both the outline and back colour slots.

**Consequence:** the design is now defined twice — CSS
(`MovieRecapSubtitleOverlay`, the step-3 mock) and ASS (`buildAss`). Both read
the same percentage-of-frame fields, so a new subtitle control must be added
to both or the preview and the export will disagree. This supersedes the
earlier entry's "not burned into the exported MP4" consequence.

## 2026-09-15 — Subtitle preview and export now share a font; default size raised (superseded)

**Bug:** a subtitle that looked right in the step-3 preview came out small in
the rendered video, at the same configured percentage. Sizing was never the
problem — both sides already scale with the frame (`cqh` in CSS, `Fontsize`
against `PlayResY` in ASS, so a value is resolution-independent). The cause was
the *face*: the preview inherited the app's UI font stack (macOS resolved
Burmese to Myanmar Sangam MN / Pyidaungsu), while libass burned
`Noto Sans Myanmar`. Burmese faces differ a lot in how much of the em box the
glyph body fills, so an identical nominal size read as two different sizes.

**Fix:** the preview overlay now loads `Noto Sans Myanmar` through
`next/font/google` — the same family `MOVIE_RECAP_SUBTITLE_FONT` names for the
burn-in. Same face on both sides, so what step 3 shows is what the export
produces.

**Also:** the default size moved 4.5% → 6% of frame height and the slider
ceiling 12% → 16% (migration also lifts existing rows still on the old
default). 4.5% is broadcast-caption size, below what recap/social video
normally uses.

**Rejected for now:** a calibration multiplier on the ASS font size to
compensate for the metric difference. It papers over the mismatch instead of
removing it and has to be re-tuned whenever the font changes — keep it in
reserve only if a residual difference shows up now that both sides share a
face.

**Consequence:** the app's preview depends on the Google-hosted
`Noto Sans Myanmar` (self-hosted at build time by `next/font`), while the
render uses whatever `Noto Sans Myanmar` fontconfig finds on the render
machine — the macOS system copy locally. Same family, but if a render host
ships a different cut, the two can drift apart again.

## 2026-09-15 — The preview was lying about subtitle size (cqh fell back to the viewport)

**Bug:** a subtitle occupying ~67% of the frame width in the step-3 preview
came out at ~30% in the export. Measured with libass at an identical 6%
setting, the same line is 33% of frame width in Noto Sans Myanmar, 39% in
Pyidaungsu, 44% in Myanmar Sangam MN — no font choice explains 67%. The
preview was rendering at roughly 2x its configured size: `font-size: Xcqh`
resolves against the nearest **size** container, and when the frame did not
establish one the unit silently fell back to viewport height (~750px instead
of the frame's ~350px). No error, just a wrong number. The export was correct
the whole time.

**Fix:** the overlay measures its frame (`offsetParent` + `ResizeObserver`) and
sets `font-size` in px from the percentage itself. `subtitleFrameClass()` and
the `container-type: size` marker are gone.

**Why not just fix the container:** a container query that silently degrades to
a completely different reference size is exactly the failure that cost this
round of debugging — the preview looked plausible while being 2x off. An
explicit measurement can be wrong, but it cannot be wrong *quietly*.

**Consequence:** the default moved 6% → 10% (migration lifts rows on the old
4.5/6 defaults). The sizes people approved while the preview was 2x were
really ~half of what they saw, so the honest preview needs a bigger number to
show the same look. For reference at 16:9 with the sample line: 6% ≈ 33% of
frame width, 10% ≈ 55%, 12% ≈ 67%.

## 2026-09-15 — Bug fixed: libass sizes by ascent+descent, CSS sizes by em (2.184x)

**Bug:** with the preview finally honest, the burned subtitle was still ~2x
smaller than the preview at the same configured percentage. Measured, same
font, same line, nominal size 100: FreeType/`drawtext` (which sizes by em, the
convention CSS `font-size` uses) draws it 1243px wide / 146px tall; libass with
`Fontsize: 100` draws it 540 x 68. The ratio is the font's
`(hhea ascender - descender) / unitsPerEm` — **2.184** for Noto Sans Myanmar,
which reserves that much vertical space for stacked Burmese marks. libass fits
ascent+descent into `Fontsize`; CSS fits the em into `font-size`. Same number,
2.18x different picture.

**Fix:** `buildAss` computes `cssPx` (the size the preview uses, in output
pixels) and writes `Fontsize = cssPx * ASS_FONT_SIZE_RATIO`
(`MOVIE_RECAP_SUBTITLE_FONT_RATIO`, default 2.184). Box padding is derived from
`cssPx` too, so it stays the CSS pill's 0.35em rather than scaling with the
inflated number. Verified: after the fix both renderers put the same line at
identical ink height (107px) and within 5% on width.

**Consequence:** `ASS_FONT_SIZE_RATIO` is per-font. Changing
`MOVIE_RECAP_SUBTITLE_FONT` without recomputing it
(`(hhea ascender - descender) / unitsPerEm` of the new face) silently
reintroduces this mismatch. This is the calibration constant the earlier entry
rejected — rejected there as a fudge for a metric difference of unknown origin;
accepted here because the origin is now measured and the number is derived from
the font, not tuned by eye.

**Note:** any render made before this fix keeps its old, small subtitles — the
size is burned in, so those projects need re-rendering.

## 2026-09-15 — The mock render opens with the preview's own sample line

`MOVIE_RECAP_SUBTITLE_SAMPLE` is now one constant used by both the step-3
preview overlay and as the first line of `MOVIE_RECAP_MOCK_NARRATION`, and the
mock path skips `splitIntoCaptionChunks` (each mock line is already one
caption). So a mock render's first cue puts the identical words, at the
identical size, in the identical place as the preview — the comparison the mock
render exists for. Real renders still split narration into caption-sized cues;
that behaviour is unchanged.

## 2026-09-16 — Styled burned-in subtitles are the only mode (supersedes)

**Decision:** the subtitle mode chooser is gone. "No Subtitles" and "SRT file
only" are removed, the Subtitle tab shows the style controls directly, and
`subtitle_mode` is dropped from the schema along with `render_subtitle_url` /
`render_subtitle_object_key`. Every render burns subtitles into the picture
with the configured design; no WebVTT sidecar is produced and the review player
carries no `<track>`.

**Why:** requested, and confirmed before implementing because it reverses the
2026-09-14 "preview edits are normalized configuration only" entry (which
listed subtitle mode as one of the per-project settings) and the
WebVTT-vs-burned-in reasoning in the two 2026-09-15 entries. Those entries'
reasoning is superseded, not just overridden: they chose a `<track>` because
this ffmpeg build had no libass, and the "srt" mode existed as the plain-export
escape hatch from a styling approach that could not reproduce the design.
libass is installed now and the burn-in matches the preview exactly, so both
reasons are gone.

**Rejected:** keeping `subtitle_mode` pinned to `'styled'`, and keeping the
`.vtt` upload as a downloadable sidecar. Both would leave a value that can
never vary plus dead code paths, the same trade rejected for `copyright_free`.

**Consequence:** there is no way to ship a recap without subtitles, and no
separate subtitle file to hand to an editor. Re-adding either means a new
column and a real branch in the render pipeline, not just a UI toggle. Any
`.vtt` objects already uploaded to R2 by earlier renders are now orphaned —
their rows no longer point at them.

## 2026-09-16 — Text shadow added, then removed; the two-layer ASS output stays

A `subtitle_shadow` toggle (offset 10% of text size, hard-edged black at 75%,
mirrored in the preview as `text-shadow: Npx Npx 0`) was built and then removed
the same day at the user's request. Its column is dropped; there is no shadow
control and no shadow in the output.

**What the attempt established, and why the ASS output still emits two layers
per cue:** no single ASS BorderStyle gives both a line-wide background box and
a per-glyph drop shadow. Tested — BorderStyle 3 paints the box but its `Shadow`
offsets the whole box; BorderStyle 1 shadows each glyph but has no box. The
two-layer split (layer 0 = `Box` style, BorderStyle 3, box colour in
`OutlineColour`, text fully transparent; layer 1 = `Text` style, BorderStyle 1,
no border) was kept because it is also what makes 0% background opacity draw
nothing at all behind the text. Anyone re-adding a shadow adds `Shadow N` to
the `Text` style and needs no restructuring.

**Rejected while building it:** painting the box layer's text in the background
colour rather than transparent — below 100% opacity the glyph fill and the box
double up and the letters show through as darker shapes.

**Also fixed (kept):** the preview pill had an unconditional `shadow-lg` that
the burned output never reproduced, most visible at 0% background opacity where
the preview drew a shadow under a box that wasn't there. Removed; neither side
draws a shadow now.

**Known remaining mismatch:** the preview pill is `rounded-lg`, the burned box
has square corners. ASS BorderStyle 3 has no corner radius.

## 2026-09-16 — The render reads the picture too: scene detection + a vision pass

**Decision:** before narration, the pipeline now detects scenes with
PySceneDetect, extracts one keyframe per scene, and has the vision model
describe each frame in one English sentence. The narration model receives
`scenes[{index, startS, endS, visual, dialogue}]` and returns one Burmese line
per SELECTED scene index — not timestamps it invented. Dialogue is matched to a
scene by overlapping the Whisper transcript with the scene's own time range.

**Why:** a transcript cannot see. Action beats, establishing shots and anything
between lines of dialogue were invisible to the old prompt, which only ever saw
text. This also fixes clip selection at the root: because the model picks scene
indexes, every recap clip starts and ends on a real cut, which is what the
"extreme duration mismatch" warnings were really complaining about. The
2026-09-15 pipeline-order entry already specified "scene detection" in step 1;
phase-two-a shipped without it, and this closes that gap rather than reversing
anything.

**Why PySceneDetect over ffmpeg `scdet`:** confirmed with the user. ffmpeg
needs no install and the pipeline already shells out to it, but it handles slow
dissolves and dark scenes noticeably worse and has no adaptive detector. The
cost is a Python dependency: `.venv-scenedetect`, invoked as a CLI through
`SCENEDETECT_BIN` (see README), not as a library binding.

**Budget decisions, measured on real footage** (71s sample: 18 scenes, detect
3.4s, keyframes 2.0s, vision 5.1s):
- Scenes shorter than 2s merge into the previous one — a recap beat is never
  half a second, and flash cuts would dominate the keyframe budget.
- At most 300 scenes are carried forward, keeping the LONGEST ones (a two-hour
  film detects ~2000 cuts; long scenes carry plot, quick cutaways rarely do).
- Keyframes are taken a third of the way into each scene — past the cut's fade
  and motion blur, still on that scene's subject.
- Images go at `detail: "low"` (~19 prompt tokens each) in batches of 25, so
  the whole vision pass costs about a page of text.

**Also:** the source is now downloaded once to the work directory and every
later ffmpeg call reads that local copy. Scene detection decodes the entire
file, and the per-segment clip extraction was re-fetching over the network for
every segment.

**Rejected:** 3 keyframes per scene (3x cost/time for motion within a shot),
and describing only dialogue-free scenes (cheapest, but then the scenes that
matter most get no visual context).

**Consequence:** a real render now spends minutes of local CPU on detection
before its first API call, every time — scene results are not cached on the
project row yet, so re-rendering the same source repeats that work. The mock
render skips detection, vision, Whisper and narration entirely, so it stays the
fast path for design work.

## 2026-09-16 — Bug fixed: the duration estimate counted Burmese "words"

**Bug:** shots flashed past and subtitles were unreadable.
`estimateSpokenSeconds` counted whitespace-delimited words and divided by 2.3
words/sec — but Burmese is not space-delimited; its spaces mark phrase breaks.
Every narration line, whatever its length, counted as ~4 "words" and got the
same **1.7s**. That single number was the clip's target duration AND the
subtitle's on-screen time, so it made short shots and sub-second cues together.

**Fixes, all three requested together:**
- **Estimate by characters** — `CHARS_PER_SECOND_BURMESE = 8.5` (unhurried
  narration). The same lines now come out 5.4-6.7s instead of 1.7s.
- **Cue floors** — `MIN_CUE_S = 1.5` and `MAX_CUE_CHARS_PER_SECOND = 11`
  (roughly broadcast practice, slower than the ~17 CPS used for Latin text).
  `timeCaptionChunks()` applies both, then reports the total.
- **Shot floor** — `MIN_SEGMENT_S` raised 1s -> 3s.

**Order reversed on purpose:** cues are now split and timed BEFORE the clip
length is chosen, and their total becomes the segment's target duration. The
video follows the subtitles rather than cutting away mid-caption. Previously
the clip length was decided first and cues were squeezed into whatever was
left.

**Consequence:** recaps get longer — every beat is at least 3s and carries its
full reading time, where before many were 1.7s. Trimming can no longer produce
a flash cut, since the trim target already includes both floors. The estimate
is still an estimate; measuring real synthesized audio from the self-hosted
VoxCPM2 worker (the voice lab's) would remove the guess entirely and is the
obvious next step — deliberately left for its own pass.

## 2026-09-16 — Tuning pass: readable, but shorter

The character-based timing fixed readability and overshot into dragging. Tuned
down without giving the floors back:

- `CHARS_PER_SECOND_BURMESE` 8.5 -> 10 (brisk recap pace, not an audiobook)
- `MIN_SEGMENT_S` 3 -> 2.5
- `MIN_CUE_S` 1.5 -> 1.3, `MAX_CUE_CHARS_PER_SECOND` 11 -> 13

**The bigger lever was the prompt, not the constants.** A narration line's
length decides how long its clip sits on screen, so the narration prompt now
asks for one idea per line, 30-60 Burmese characters, never over 80. Measured
on sample lines: constants alone took three beats from 18.0s to 15.3s; with
short lines the same three beats are 11.1s, each 3-5s with cues at ~10.5 ch/s
(still under the 13 ceiling).

**Consequence:** pacing is now shared between a prompt instruction and the
timing constants, so a future "too fast"/"too slow" complaint can come from
either. Check the generated `render_script` line lengths first — if lines are
running 80+ characters the model is ignoring the instruction, and no constant
will fix that.

## 2026-09-16 — Second tuning pass, and where the floor is

Shots still dwelled. Pace raised again and lines shortened further:

- `CHARS_PER_SECOND_BURMESE` 10 -> 12.5
- `MIN_SEGMENT_S` 2.5 -> 2, `MIN_CUE_S` 1.3 -> 1.2,
  `MAX_CUE_CHARS_PER_SECOND` 13 -> 15
- narration prompt: 25-45 Burmese characters per line, 60 max (was 30-60/80)

Measured on the same three lines: 13.1s -> 11.1s -> **8.9s**, beats now
2.6-3.8s at ~13 ch/s.

**This is the floor for the constants.** ~13 ch/s of Burmese is the fast end of
readable, and the whole reason this timing work started was captions that could
not be read. Further shortening should come from shorter narration lines, not a
higher rate — if beats still feel long, check `render_script`: a line over ~60
characters means the model ignored the prompt, and lowering the constants will
only make that line unreadable rather than shorter.

## 2026-09-16 — Narration register: spoken Burmese, not literary

**Problem:** the script read like a book being recited — `ပစ်ချနိုင်ခဲ့သည်`,
`အပြင်းအထန်လိုက်သည်`. Burmese is diglossic, and the model defaults to the
literary register (စာပေ) for anything that looks like writing, which is wrong
for a voice-over.

**Fix:** the narration prompt names the grammar instead of asking for a tone.
"Write naturally" does not move a model off literary Burmese; naming the
endings does. Three lines: spoken endings တယ်/ပါတယ်/မယ်/တာ and never သည်; တွေ
not များ, ရဲ့ not ၏, ဒီ/အဲဒီ not ဤ/ထို, no သော/လျက်/ခြင်း; plain everyday
words.

**Kept deliberately short.** A first version spelled the same rules out over
eight lines with a before/after example. It worked, but the register block was
then a third of the prompt and crowded the instructions that decide content and
line length. The Burmese tokens are the entire lever — the English around them
is padding, so it was cut back to one sentence each and re-verified.

**Verified** with real generations over five synthetic scenes, before and after
the trim: 5/5 lines in spoken register both times, 48-55 characters, e.g.
`သူက ဒုံးကျည်ပစ်ပြီး ရန်သူလေယာဉ်ကို ဖျက်ဆီးလိုက်တယ်`.

**Consequence:** the register rules are a third of the narration prompt now. If
lines ever drift back to သည် forms, the check is the prompt, not the timing
constants — and `render_script` is the place to look, since the burned subtitle
is that text verbatim.

## 2026-09-16 — Long captions were overpaid: tiered reading rate + a hard shot cap

**Problem:** long subtitle lines held their shot longer than they should. The
estimate was linear — characters ÷ 12.5 — so a 57-character line always cost
4.4s. Reading is not linear: starting a caption costs the most, continuing it
is faster.

**Fix:** the first `LEAD_IN_CHARS` (35) are timed at 12.5 ch/s and everything
after at `CONTINUATION_CHARS_PER_SECOND` (20). Added `MAX_SEGMENT_S = 5` as a
hard ceiling on any single shot: over it, cues are squeezed by a common factor,
but never past `ABS_MAX_CUE_CHARS_PER_SECOND` (18), so an over-long line
overruns the cap instead of becoming an unreadable flash.

Measured (flat -> tiered+cap): 33 chars 2.5s -> 2.5s, 51 chars 4.1s -> 3.8s,
57 chars 4.4s -> 3.8s, 96 chars 5.3s -> 5.3s at the 18 ch/s limit.

**Consequence:** short lines are unchanged, medium lines tighten, and a shot
that still runs past 5s means the narration model wrote a line far over the
prompt's 60-character limit. That is a prompt problem — the timing layer
deliberately refuses to fix it by making the caption unreadable.

## 2026-09-16 — Third timing pass: long captions cost less again

Long lines still held their shot too long. Only the long-line path was touched;
short lines are unchanged by design.

- `CONTINUATION_CHARS_PER_SECOND` 20 -> 28 (everything past the first 35
  characters)
- `MAX_SEGMENT_S` 5 -> 4, `MAX_CUE_CHARS_PER_SECOND` 15 -> 16,
  `ABS_MAX_CUE_CHARS_PER_SECOND` 18 -> 20

Measured (before -> after): 33 chars 2.5s -> 2.5s, 48 chars 3.7s -> 3.6s,
53 chars 3.5s -> 3.3s, 91 chars 5.1s -> 4.5s.

**Where this now sits:** a 91-character line runs every cue at the 20 ch/s
absolute limit — the timing layer is out of room, and that line is 50% over the
prompt's 60-character maximum. Further shortening has to come from the
narration prompt (or from enforcing length at generation time), not from these
constants; lowering them further only produces captions that cannot be read.

**Not done, and the reason:** enforcing `maxLength` on the narration schema was
started and stopped. It would cap line length at generation time rather than
asking for it in prose, and nothing in the pipeline truncates text — worth
testing whether strict structured outputs accepts the keyword before relying
on it.

## 2026-09-16 — About a second off every caption, and ending variety

**Timing.** Asked for roughly 1s off a ~10-word (45-55 character) line:
`LEAD_IN_CHARS` 35 -> 20, `CONTINUATION_CHARS_PER_SECOND` 28 -> 36,
`MAX_CUE_CHARS_PER_SECOND` 16 -> 22, `ABS_MAX_CUE_CHARS_PER_SECOND` 20 -> 26,
`MIN_CUE_S` 1.2 -> 1, `MAX_SEGMENT_S` 4 -> 3.5. Measured: 33 chars 2.5s ->
2.0s, 48 chars 3.6s -> 2.7s, 53 chars 3.3s -> 2.4s, 91 chars 4.5s -> 3.6s.

Cues now run at 21-26 ch/s, well past the ~13 ch/s this timing work started
from and past ordinary broadcast practice. That is a deliberate, user-made call
by a native Burmese reader on their own footage, not a derived number — do not
"correct" it back toward a standard reading rate without asking.

**Ending variety.** Every generated line ended in တယ်, which reads as a list
rather than narration. Cause was the prompt itself: it listed တယ်/ပါတယ်/မယ်/တာ
as the allowed spoken endings and the model took the first one every time. The
rule now states the constraint (never သည်) and asks for variation across
တယ်၊ ပါတယ်၊ တာ၊ တာပဲ၊ မယ်၊ လိုက်တယ်၊ နေတယ်၊ ခဲ့တယ်၊ ပြီ, with no three lines
ending alike. Listing permitted forms without asking for variation is what
caused the monotony — worth remembering for any future register rule.

## 2026-09-16 — Register rules replaced by a role; တယ် is not prompt-induced

**Replaced** the grammar checklist (spoken endings, never သည်, တွေ not များ,
ရဲ့ not ၏, no သော/လျက်/ခြင်း) with two sentences: the model is a Burmese recap
narrator on YouTube, writing lines the way it would say them aloud rather than
the way they would be written in a book.

**Tested, and it holds:** 5/5 lines came back in spoken register with no
literary forms at all. The checklist was not doing the work its earlier entry
claimed — a role framing is enough, and it leaves room for the model to vary
its own phrasing.

**Correction to the previous entry:** every line ending in တယ် was blamed on
the prompt listing တယ် first. That was wrong, and was asserted without testing.
With the ending list removed entirely, output is still 5/5 တယ် — it is how the
model writes Burmese declaratives, not something the wording induced. Forcing
alternatives (ပြီ၊ မယ်၊ တာပဲ) changes tense or mood, so it is left alone unless
a native listener says the repetition actually grates.

**Still open:** the line-length rule (25-45 characters, 60 max) is the weakest
instruction in the prompt — generations run 48-64. Since line length sets shot
duration, that is where pacing complaints should be aimed next, not at the
timing constants.

## 2026-09-16 — Subtitle weight is three-way, "Extra bold" is faked in both layers (superseded)

**Decision:** `subtitle_bold` (boolean) is replaced by `subtitle_font_weight`
(400 / 700 / 900, checked in SQL, backfilled bold→700). The customize step now
shows a "Font weight" three-button picker instead of a Bold switch, because the
reference look the user is matching (heavy yellow Burmese captions) is heavier
than Noto Sans Myanmar's 700.

**900 is not a heavier font file.** ASS/libass has a single Bold flag and no
weight axis, so a real 900 cut cannot be selected in the burn-in at all. "Extra
bold" is therefore bold glyphs plus an outline in the *text* colour, which
grows the glyph body outward: ASS `Outline = round(cssPx *
MOVIE_RECAP_SUBTITLE_FAUX_BOLD_EM)` with `OutlineColour` = the text colour on
the `Text` style (the `Box` style is untouched, so the pill does not grow).

**Rejected: a real 900 face in the CSS preview only.** It previews a weight the
export cannot produce — the same parity failure the font-face and `cqh` entries
above already cost a day each. The preview fakes it the same way instead:
`-webkit-text-stroke` in the text colour at *double* the width with
`paint-order: stroke fill`, since CSS centres the stroke on the glyph edge
while ASS grows outward — doubling and painting the stroke under the fill
leaves exactly the outward half visible.

**Consequence:** at 900 the outline shares the `Text` style's colour, so it is
invisible against the text by design. If a *contrasting* outline (black rim
around yellow text) is ever wanted, that is a separate setting — do not
repurpose the faux-bold outline for it, or weight and rim will fight over one
ASS field.

## 2026-09-16 — Text shadow is configuration (supersedes "no drop shadow")

**Decision:** new `subtitle_shadow` (% of the subtitle font size, 0–20, default
0 = off) and `subtitle_shadow_color`, exposed in the customize step as a slider
plus a colour row that only appears above 0.

**Supersedes the "No drop shadow" note** in the subtitle-overlay entry above.
That note was never "shadows are wrong" — it was parity: the ASS style wrote
`Shadow 0`, so a CSS shadow was decoration the export could not reproduce. Both
layers now read the same setting, so the rule it was protecting still holds.

- Render: `Shadow` on the `Text` style, with the shadow colour in `BackColour`;
  the `Box` style keeps `Shadow 0`, so the pill does not get its own shadow.
- Preview: `text-shadow` with the SAME offset on x and y and a **0 blur
  radius**, because libass offsets the shadow on both axes and does not blur
  it. A softer, blurred CSS shadow is rejected for that reason.
- Size resolves against `cssPx` (the CSS-equivalent font size), not the
  ASS-inflated `fontSize`, same as the pill padding.

**Note for a future reader:** shadow and the 900 "extra bold" faux outline use
different ASS fields (`Shadow`/`BackColour` vs `Outline`/`OutlineColour`), so
they compose — an extra-bold caption can still carry a shadow.

## 2026-09-16 — Shadow and heavy weight are switch + options, not magic values

**Decision:** both extras follow the same shape as Add Logo and Blur — a
`Switch` that turns the feature on, and its options revealed only when it is
on. New columns `subtitle_shadow_enabled` and `subtitle_font_weight_enabled`
(both default false); backfilled from what each project already rendered
(shadow > 0, weight <> 400).

**Rejected: "off" as a value inside the control** (0% on the shadow slider, a
"Regular" entry in the weight picker). It reads as a setting when it is really
a feature switch, and it left two encodings of the same state — a project could
sit at `shadow_enabled`-equivalent 0% while carrying a shadow colour, and the
weight picker showed three buttons where one of them meant "none of this". The
value columns now only ever hold the *on* look: `subtitle_shadow` is checked
1–20 (default 6) and `subtitle_font_weight` is 700 or 900 (400 is gone).

**Consequence:** the render and the preview both gate on the boolean, never on
the value — do not "simplify" `subtitleShadowEnabled ? … : 0` back to a
`subtitleShadow > 0` test, or a project that is switched off but still holds
its remembered 6% will start drawing a shadow again.

## 2026-09-16 — Bold and shadow are switches with no knobs (supersedes both entries above) (superseded)

**Decision:** the subtitle tab exposes exactly two booleans — `subtitle_bold`
and `subtitle_shadow`. The size slider, shadow-colour row and the
Bold/Extra-bold picker added earlier today are gone, along with the columns
behind them (`subtitle_shadow`, `subtitle_shadow_color`, `subtitle_font_weight`
were dropped; the two `*_enabled` booleans were renamed to the plain names).

**Why the earlier shape was wrong:** those entries treated shadow depth and
weight step as things a user would tune per project. They are not — every
project wants the same one, and each extra control is another number that has
to stay in parity between the CSS preview and the ASS style. The look is now
fixed in code: `MOVIE_RECAP_SUBTITLE_SHADOW_EM` (0.06 of the font size) and
`MOVIE_RECAP_SUBTITLE_SHADOW_COLOR` (black), read by both layers.

**Also dropped: the 900 "extra bold" faux outline.** With no weight step to
choose, nothing sets it, so the `Outline`/`OutlineColour` trick and
`MOVIE_RECAP_SUBTITLE_FAUX_BOLD_EM` are removed and the `Text` style is back to
`Outline 0`. The reasoning in the superseded entry still stands if a heavier
weight is ever wanted again — libass has a Bold flag, not a weight axis, so it
would have to be faked in both layers the same way.

**Consequence:** `Outline` on the `Text` style is free again. A future
contrasting rim (black edge around yellow text) can use it without fighting a
weight setting for the same field.

## 2026-09-16 — Blur region preview: no tint, and the radius is converted

**Reported as "the subtitle colour changes after render."** It does not — the
same glyph measures `#FAE17F` in the export and `#FAE179` in the preview, and
`#FFE066` survives ass → libx264 → yuv420p → decode as `#FEE066`. What differed
was the *backdrop*: the preview's blur region carried `bg-panel/35` (plus
`shadow-lg`), so the area behind the caption was darkened in the preview and
merely blurred in the export. Yellow on a dark wash reads bright; the same
yellow on a blurred near-white scene reads olive.

**Decision:** the blur region draws blur only. The tint and drop shadow are
removed; the accent border and the grip icon stay, as editor chrome that is
obviously not part of the picture.

**Decision:** the blur radius is converted instead of copied. `boxblur` is
specified in OUTPUT pixels (1280/720 wide) while the preview frame is drawn a
few hundred CSS pixels wide, so `backdrop-blur-md` was blurring far harder than
the render. `MOVIE_RECAP_BLUR` (radius 12, 2 passes) is now the single source
for both, and `movieRecapBlurCssPx` maps it to a CSS gaussian: N box passes of
radius r ≈ sigma `sqrt(N * ((2r+1)^2 - 1) / 12)`, scaled by the measured frame
width over the output width. `TARGET_DIMENSIONS` moved to
`lib/constants/movie-recap.ts` so the client can do that scaling.

**Consequence:** the blur region is fainter on busy footage than the old tinted
box. That is the point — it now shows what the export will contain. Do not
re-add a wash to make it easier to see; use the border/grip instead.

## 2026-09-16 — "Yellow" is the reference lime yellow, not gold (superseded)

The Yellow swatch is `#D9E824`, sampled (median of the glyph core) from the
reference caption the product is matching, replacing `#FFE066`. Projects on the
old hex were moved in the same migration so their picker still shows a
selection; a project that had deliberately picked gold has no way to get it
back from the swatch list, which is accepted — the list is three fixed choices,
not a colour picker.

## 2026-09-16 — Subtitle pill padding is even, and defined once (superseded)

**Problem:** the pill looked tight at the sides and loose above/below, and the
two layers disagreed. The preview used `px-[1.2em] py-[0.35em] leading-snug`;
the ASS box used `Outline = 0.35em` on *both* axes. Measured on a burn at a
48.6px CSS size: sides 20px, top/bottom 35px — because libass sizes the box
from the font's LINE box (Noto Sans Myanmar reserves 2.184em for stacked
Burmese marks) while the glyph ink is much shorter, so an equal pad never looks
equal.

**Decision:** `MOVIE_RECAP_SUBTITLE_PILL` in `lib/constants/movie-recap.ts` is
the only definition — `padEm: 0.35`, `sideSpaceEm: 0.257`, `lineEm: 2.184`.

- Render: the **box layer** (not the glyph layer) carries one hard space `\h`
  per side on every `\N` line. libass grows the background to fit it while the
  glyphs, drawn from the untouched text, stay centred. Measured result: sides
  31/34px vs top/bottom 34/36px — even.
- Preview: explicit `lineHeight: 2.184` (so the CSS line box equals the ASS
  one — half-leading becomes zero and the ink centres the same way) and
  `padding: 0.35em 0.607em`, where 0.607 = `padEm + sideSpaceEm`. Tailwind's
  `leading-snug` is gone precisely because it made the CSS box shorter than the
  rendered one.

**Rejected: widening the sides with a larger `Outline`.** ASS has one padding
value for both axes, so it would have made the vertical gap grow too. Rejected:
drawing the box with ffmpeg `drawbox` — the server does not know the shaped
text width, only libass does.

**Consequence:** `sideSpaceEm` is the width of a space in Noto Sans Myanmar. If
`MOVIE_RECAP_SUBTITLE_FONT` is ever changed, re-measure it (and `lineEm`, which
is the same ratio as `ASS_FONT_SIZE_RATIO`) or the preview's side padding will
drift from the render's.

## 2026-09-16 — The pill is a plain square box (feather tried, then removed) (superseded)

**Reported as "the border around is not soft."** The preview drew the pill with
`rounded-lg`; the export draws it with ASS `BorderStyle 3`, which is a hard
rectangle — libass has no corner radius. So the render could never match, and
the CSS radius was previewing something unreachable.

**Rejected: rounding the box in the export.** A rounded rect would have to be an
ASS drawing sized to the shaped text, and only libass knows that width — the
render pipeline cannot measure Burmese shaping itself. Also rejected: dropping
the softness and keeping a crisp rectangle in both (offered, not chosen).

**Also rejected, after trying it: feathering the pill.** `{\blur N}` on the ASS
box layer (with a matching `filter: blur()` on a preview layer) does soften the
edges, and it was built and then removed — the blurred background reads as a
smear behind the caption, and the video already has a *separate* blur feature,
so a second, unrelated blur on the subtitle is confusing.

**Decision:** the pill is a plain hard-edged rectangle in both layers. The
preview has no `rounded-lg`, no feather layer — just `backgroundColor` on the
same padded box libass draws.

**Consequence:** do not re-add a CSS radius or blur to the pill "to make it look
nicer". Both were tried; both only exist in the preview.

## 2026-09-16 — Output stays 1280×720 for now (9:16 raised to 1080×1920 on 2026-09-18, below; 16:9 unchanged)

Caption edges looking stepped was traced to playback, not the pipeline: the ASS
box rasterizes on exact integer rows (measured: single-row transition, no
anti-aliased band) and survives the libx264/yuv420p encode within ~3/255, so
sub-pixel rounding, a canvas/scale mismatch and chroma subsampling are all ruled
out as causes here. What remains is that `TARGET_DIMENSIONS` is 1280×720, so any
player on a large screen upscales an already-rasterized box.

Raising it to 1920×1080 was offered and **deliberately deferred** — longer
renders and bigger files, for a problem that only shows on big screens. Treat
the 720p output as a known trade-off, not an oversight.

## 2026-09-16 — Real narration: Azure Speech, and audio now sizes the picture

Supersedes "Phase-two-a: real render pipeline, TTS synthesis stubbed to
console.log" — only its TTS-skipped part; everything else in that entry stands.

**Decision:** the render synthesizes narration for real, one call per beat,
through `lib/tts/` (see `history/voice-lab.md` for the provider contract). Movie
Recap's Settings tab offers the two Azure Burmese neural voices —
`my-MM-ThihaNeural` and `my-MM-NilarNeural` — and nothing else. The synthesized
track is muxed into the export.

**Why per-beat calls, not one call for the whole script:** every beat needs its
own measured duration to size its video segment. Synthesizing the script as one
clip would mean splitting it again on silence, which is guesswork, and a wrong
split desynchronizes everything after it.

**Why the Azure voices replaced `narrator`:** the self-hosted VoxCPM2 worker
runs on CPU at tens of seconds per clip (see `history/voice-lab.md`), which a
render with dozens of beats cannot wear. VoxCPM2 stays a provider and stays in
the lab, so the comparison that decides whether to move back to our own service
is still one edit away — flip `surfaces` on the voice.

**Measured audio now outranks the caption cap.** `timeCaptionChunks` caps a beat
at `MAX_SEGMENT_S` (3.5s). That was right against a character-count estimate, but
it would now cut real speech off mid-word, so a segment whose audio is longer
than the cap is stretched to the audio's length and its cues are stretched with
it. This is the "narration audio duration is authoritative" rule from the
phase-two design entry, finally with real audio behind it.
`estimateSpokenSeconds` is not dead code: it is what a mock render still uses.

**Decided against storing the audio.** Clips live in the render's temp workDir
and go away with it. A recap script is ~2-3k characters: on Azure's free (F0)
tier that is ~150-250 renders inside the 0.5M-characters-per-month allowance, and
on S0 it is about four cents a render at $15 per 1M characters. Caching it would
add columns, object keys, and cleanup for that. It is also usually the wrong thing to reuse — the narration
script is regenerated on every render, so cached audio would be stale more often
than it would be reused. Revisit if per-beat re-rendering is ever built.

**Mock renders stay silent**, and stay on the estimate. Being free of API spend
is the entire reason mock exists.

**429 is a normal event, not a failure.** F0 allows 20 synthesis requests per
60 seconds and the limit is not adjustable, while a render fires one request per
narration beat back to back — any recap of real length crosses it. The Azure
provider therefore retries a 429 up to five times, honoring `Retry-After` and
otherwise backing off linearly toward the length of that 60-second window. S0
raises the ceiling but does not remove the case: Azure also answers 429 while its
backend scales.

**Consequence:** a real render now fails outright when `TTS_AZURE_KEY` /
`TTS_AZURE_REGION` are missing, where before it produced a silent video. The
Azure voices ship with `previewUrl: null` — no sample clips have been recorded —
so the Settings tab shows no play button next to them. The migration
`20260916230000_movie_recap_azure_voices.sql` rewrites existing `narrator` rows
to `azure-thiha`; `resolveMovieRecapVoice()` also falls back at runtime, so a
row that escapes the migration renders in the default voice instead of failing.

## 2026-09-16 — Voice previews are synthesized on demand, not shipped as files (superseded same day)

**Decision:** every voice card in the Settings tab has a working play button.
A voice with a recorded clip (`previewUrl`) plays that file; the Azure voices
have none, so the first press calls `POST voices/preview`, which synthesizes
that voice's own `sampleText` and returns the WAV inline as base64.

**Why not commit two sample MP3s to `public/`:** the sample line and the voice
parameters live in the catalog, so a checked-in clip is a copy that silently goes
stale the moment either changes — and it would have to be regenerated by hand for
every voice added later. Synthesizing from the catalog means the preview is
always the voice as configured.

**Cached on both sides, because the bytes cannot differ.** The preview is one
fixed line in one fixed voice for every user, so the route holds a
module-level `voiceId -> base64` map and the client keeps the object URL for the
session. Without that, a user clicking play four times would spend four of the
free tier's twenty requests per minute on identical audio. The server map has a
fixed ceiling (one short clip per catalog voice) and lives for the process —
the same single-process assumption the render's cancel map already makes.

**Consequence:** the first press on a cold server waits on Azure — roughly a
second, shown as a spinner in the button, with every other card's button
disabled meanwhile so two synthesis requests can't race. A voice preview also
fails when Azure is unconfigured, where before the button simply wasn't there.
The client's object URLs are revoked on unmount.

## 2026-09-16 — Bug fixed: SSML namespace capitalisation, diagnosed the long way

**Bug:** every Azure request failed with `Azure Speech returned 400.` and no
detail. The envelope was built with
`xmlns="http://www.w3.org/2001/10/Synthesis"`; the namespace is lowercase
`synthesis`. One character.

**Why it cost so much to find:** Azure answers a malformed envelope with a 400,
an empty body, and no `x-requestid` — indistinguishable from a wrong voice name,
an unsupported output format, a bad key, or the wrong endpoint host. Ruling those
out took a voices/list call (both Burmese voices present in `westus3`), a token
exchange (auth was fine), three output formats (all fine), and finally bisecting
the SSML itself.

**Consequence:** `buildSsml` is exported and tested for exactly this
(`lib/tts/providers/azure.test.ts`), because the request body is the part of the
provider that fails without saying so. `Content-Type` also now carries
`charset=utf-8` — the narration is multi-byte Burmese.

**For the next 400:** do not start from the code. Send the smallest possible
English request with curl, confirm it returns 200, then add back one piece of
the real request at a time. The failure gives nothing to read, so bisection is
the only tool.

## 2026-09-16 — Voice previews are static files after all (supersedes)

Supersedes "Voice previews are synthesized on demand, not shipped as files".

**Decision:** each Azure voice's `previewUrl` points at a committed MP3 under
`public/movie-recap/voices/<voice-id>.mp3`. The play button plays a file and
never calls Azure. `scripts/generate-voice-previews.ts` writes those files from
the catalog:

```
node --experimental-strip-types --env-file=.env scripts/generate-voice-previews.ts
```

**Why the reversal:** the on-demand version was already cached on both sides, so
the spend was ~124 characters per server process — but `next dev` resets module
state, the cost is not bounded by anything the code controls, and pressing play
could fail (Azure down, quota gone, key missing) for audio that never changes.
A file cannot fail. The earlier entry's objection — that a committed clip goes
stale when `sampleText` or the voice params change — is answered by generating it
from the catalog rather than by hand.

**Why a script and not two curl commands in the README:** the script reads
`VOICES`, so adding an Azure voice means running one command, not writing a new
curl line with the right namespace in it.

**Consequence:** changing a voice's `sampleText` or `params` without rerunning
the script leaves the button playing the old reading, with nothing to flag it.
`POST voices/preview` stays for voices with no file (the self-hosted ones), and
the wizard still falls back to it. `buildSsml` moved to `lib/tts/ssml.ts` — a
module with no runtime imports, because `node --experimental-strip-types` cannot
resolve the extensionless imports the app uses; `allowImportingTsExtensions` in
`tsconfig.json` is what lets `scripts/` be typechecked alongside the app.

**MP3, not WAV:** these ship in the repo and are only played in a browser, so
size wins — 51KB and 59KB against ~200KB each as WAV.

## 2026-09-16 — The render player shows the file's own shape, and unmutes

**Decision:** `MovieRecapRenderPlayer` no longer sets its box from
`project.aspectRatio`. It sizes to the video, capped at the panel width and
70vh. It also dropped `muted`.

**Why:** this player's job is to show what came out of the render. Sizing the box
from the *configuration* means a render whose shape disagrees with it — a stale
output from before an aspect-ratio change, or any future pipeline bug — gets
silently letterboxed into looking correct. The file's own shape is the thing
worth seeing here. `muted` dated from the phase where the export had no audio
track at all; it now carries narration, which is the part most worth checking.

**Consequence:** the player's width now varies with the video rather than being
a fixed column. The step-3 customize preview still uses the configured ratio —
that one IS about the configuration.

## 2026-09-16 — Subtitle look is a preset; size follows the aspect ratio (supersedes)

Supersedes, in whole or in part, every subtitle-styling entry above: the shared
font/default-size entry, the three-way weight, "Bold and shadow are switches with
no knobs", the yellow/white colour list, and both pill entries. Their *findings*
still hold — the 2.184 libass/CSS ratio, the Noto Sans Myanmar requirement, the
`cqh` trap — only the controls are gone.

**Decision:** the Subtitle tab offers two presets and nothing else about the look.

- `yellow` — `#D9E824` text, black outline, bold, `outlineEm` 0.14
- `mono` — `#000000` text, white outline, SemiBold (600), `outlineEm` 0.14

Both are bold, both draw a hard black OUTLINE at `OUTLINE_EM` (0.08 of the font
size), neither has a background box or a drop shadow. Size is not chosen at all: `MOVIE_RECAP_SUBTITLE_SIZE_PCT` gives
10% of frame height for 16:9 and 4% for 9:16. Position and edge distance remain
editable — they depend on the footage, not on taste.

**Why:** a caption has one job, staying readable over moving video, and the
settings that achieve it are few and known. A colour list, a size slider, an
opacity slider and two switches can be arranged into output that fails that job,
and every one of them had to be kept in sync between the CSS preview and the ASS
export — which is what the superseded entries above are mostly about.

**Why size is per aspect ratio and not one number:** the percentage is of frame
HEIGHT. 10% of a 720-tall landscape frame is 72px on a 1280-wide picture; 10% of
a 1280-tall portrait frame is 128px on one only 720 wide — more than twice the
relative size. The two values put the caption at a comparable fraction of the
picture's width in both.

**What the code lost:** the ASS output is one style and one layer per cue. The
two-layer box/glyph split, the hard-space side padding, and
`MOVIE_RECAP_SUBTITLE_PILL` existed only to draw the background pill and are
gone with it. `movieRecapSubtitleStyle()` in `lib/constants/movie-recap.ts` is now
the single place the preview and the render agree on a caption's appearance.

**Migration `20260916240000_movie_recap_subtitle_presets.sql`:** existing rows
map to the preset matching their old `subtitle_color` (white → `white`,
anything else → `yellow`). A hand-set size, a background pill, and the bold and
shadow switches have no preset equivalent and are dropped with their columns —
a project that had turned the shadow off or the pill on will render differently
after this. That is the intended consequence, not a bug.

## 2026-09-16 — Outline, not drop shadow, and no second copy behind the glyph

**Decision:** the preset draws a black outline around every glyph (ASS `Outline`
= 0.08 × the CSS-equivalent font size; `-webkit-text-stroke` with
`paint-order: stroke fill` in the preview) and `Shadow` is 0.

**Why outline:** an offset shadow darkens one side of a glyph only, so a white
caption still dissolves where the frame behind it is pale on the other three.
An outline is the one treatment that survives a pale frame, a dark frame, and
the boundary between them — which is what the reference caption being matched
uses.

**Why no shadow alongside it:** both were burned together and looked at first.
The offset copy reads as a grey ghost trailing every glyph and makes the outline
itself look doubled. The reference has no such ghost.

**Why `paint-order: stroke fill` in CSS:** `-webkit-text-stroke` alone centres
the stroke on the glyph contour, so half of it eats into the letterform and the
preview reads thinner than the export — libass expands the contour outwards.
Painting the stroke behind the fill reproduces that.

**How this was checked:** the ASS style was rendered to a single frame over a
flat grey with `ffmpeg -f lavfi -i color=... -vf ass=...` and the caption area
cropped out, at shadow 3px, 2px and 0. That is the way to judge a subtitle
change — the CSS preview is an approximation of libass, not the other way round.

## 2026-09-16 — The second preset is black-on-white-outline, and outline colour belongs to the preset (colours re-inverted; the outlineColour part stands)

**Decision:** the second preset is `black` — black fill, white outline — not
`white` with a black outline. `outlineColor` moved out of the module-level
constants and onto each preset entry.

**Why:** the reference caption for it inverts the first preset rather than
recolouring it. A single shared outline colour could express one of the two but
not both, so it was never a property of "captions in general" — it is a property
of a look.

**Consequence:** migration `20260916250000_movie_recap_subtitle_black_preset.sql`
renames the stored value `white` → `black` and moves the check constraint with
it. The preset ids are the DB values, so a look cannot be renamed in code alone.

Verified the same way as the outline itself: burned over flat grey with libass
and compared against the reference before pushing.

## 2026-09-16 — Weight and outline thickness are per preset, measured off the reference (weight corrected below)

**Decision:** `bold` and `outlineEm` moved onto the preset entries. `yellow`
stays bold with a 0.08em outline; `black` is REGULAR weight with a 0.111em
outline.

**Why:** the two reference frames are not the same look at two colours. The
black one's stems measure ~6.5% of the caption's ink height — lighter than this
font at 700, which is what the export was drawing — and its white outline is
proportionally much thicker. Stacked against the reference, bold read visibly
heavier while regular+thicker-outline matched. The outline carries the weight in
that look, not the letterform.

**How it was measured, and the limit of it:** the reference is a 396px-wide,
heavily compressed crop, so per-pixel run statistics on it are dominated by
antialiasing — a first pass "measured" a 2px stroke that visibly is not 2px.
What worked: render candidates through libass at 1280×720, crop each to its ink
bounding box, scale every crop to the reference's width, and stack them with
`vstack` for a like-for-like look. Trust the stack, not the pixel counter, and
never trust either against an uncompressed source.

**Consequence:** a preset now owns colour, outline colour, outline thickness and
weight — everything about how a caption looks. Nothing about the look is shared
between presets any more except the size rule and the absence of a background
box.

## 2026-09-16 — The reference face is Noto Sans Myanmar Medium, and libass needs a family name to get it

**Weight since raised to 600 by request — see the note at the end of this entry.**

**Finding:** the reference caption is the SAME family the app already uses.
Rendering the identical line in Noto Sans Myanmar, Pyidaungsu, Padauk and Myanmar
Sangam MN and zooming on `ပေါ်က` settles it — the other three differ in shape,
Noto matches exactly. What differed was WEIGHT: at 400 / 500 / 600 / 700, the
reference sits on 500. The `black` preset therefore carries `weight: 500`, not
regular as the entry above concluded from a small-scale comparison.

**Why this needed a code change and not just a number:** ASS has one weight
control, a Bold flag, so any weight between regular and bold can only be selected
by naming the family fontconfig maps to that cut. `MOVIE_RECAP_SUBTITLE_FONT_MEDIUM`
(default `Noto Sans Myanmar Med`, which is what `fc-match` resolves on macOS)
names it; `subtitleFace()` picks between that and the Bold flag from the preset's
weight. The CSS preview loads 500 from `next/font` alongside 400/700.

**Trap that cost a pass:** `fc-match "Noto Sans Myanmar SemiBold"` returns
**Verdana** — fontconfig's family names for the cuts are the abbreviated
`Noto Sans Myanmar Med` / `SemBd` forms. Naming a weight the obvious way silently
renders a fallback face that still shows Burmese (libass falls back per glyph),
so the render looks plausible and is not the font asked for. Always confirm a
family name with `fc-match` before putting it in a style.

**Consequence:** a render host without the named cut falls back to Regular —
lighter than the preview, not broken. `fc-match "Noto Sans Myanmar Med"` /
`"... SemBd"` on the render host is the check;
`MOVIE_RECAP_SUBTITLE_FONT_MEDIUM` and `MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD` are
the overrides.

**Raised to 600 (2026-09-16, by request).** The measurement above still stands —
the still crop measures closest to 500 — but the preset ships SemiBold: the
caption plays over moving footage, not a frozen frame, and the extra weight holds
up there. 700 remains too heavy against the reference. `subtitleFace()` picks the
SemBd family for 600 the same way it picks Med for 500.

## 2026-09-16 — Second preset back to white-on-black-outline

**Decision:** the second preset is `white` again — white fill, black outline —
reverting the colour inversion recorded above. Migration
`20260916260000_movie_recap_subtitle_white_preset.sql` renames the stored value
`black` → `white`.

**What survives from the inverted pass:** everything except the two colours. The
outline colour still belongs to the preset rather than being one shared constant,
and the weight (SemiBold 600) and outline thickness (0.111em) were both measured
during it and are unchanged — they were derived from the reference's proportions,
which an inversion does not alter.

**Note for whoever reads this next:** this look flipped twice while the reference
was being pinned down (white-on-black → black-on-white → white-on-black). Each
flip cost a migration because the preset id is the stored value and is kept honest
about what it draws. If a third reference frame appears, compare it against a
burned frame BEFORE changing the catalog — the comparison method is in the entry
above, and it is cheap.

## 2026-09-16 — 16:9 caption size set from a reference frame: 10% -> 6.5%

**Decision:** `MOVIE_RECAP_SUBTITLE_SIZE_PCT["16:9"]` is 6.5, down from 10.

**How it was derived:** the reference frame supplied for it is PORTRAIT
(828x1434). Its Burmese caption measures 51px of ink height, and this font's ink
runs about 1.68x the font size once marks stack above and below, so the font size
is ~30px — 3.6% of that frame's width. Size is held to a fraction of WIDTH across
ratios (a caption's readable length tracks the picture's width, not its height),
so a 1280-wide frame wants ~47px, and `SIZE_PCT` is a percentage of height:
47/720 = 6.5%.

**`9:16` followed, 4% -> 2% -> 2.5%**, once a screenshot of a portrait render
confirmed the captions were oversized there too. The strict width match put it at
2.0% and that read undersized, so portrait ships at 2.5% (4.4% of width against
landscape's 3.6%).

**Consequence:** captions are smaller than they were in both ratios, and the two
are deliberately NOT at the same fraction of width — a portrait frame is watched
at phone size, where the strict match is too small. The width rule is the starting
point for a new aspect ratio, not the final answer; burn a frame and look.

## 2026-09-16 — The yellow preset's outline was half the reference's: 0.08 -> 0.14

**Finding:** compared against a TikTok recap caption, the difference was neither
the family nor the weight — both already matched (Noto Sans Myanmar, bold). It
was outline thickness:

| | outline | stem | outline/stem |
| --- | --- | --- | --- |
| reference | 4px | 5px | 0.80 |
| ours at 0.08em | 1-2px | 4px | 0.25-0.50 |

`outlineEm` for `yellow` is now 0.14, which puts the outline at roughly the width
of the stems it surrounds — what the reference does.

**Worth remembering:** "the font looks different" was reported, and the font was
identical. Outline weight changes the apparent typeface enough to read as a
different face at caption size. Measure outline-to-stem before reaching for a
font substitution.

**`white` followed to 0.14** by request, so both presets now wear the same
outline weight and differ only in colour and one step of font weight (700 vs
600). Its earlier 0.111 came from its own reference frame; that measurement is
superseded by the preference for the heavier treatment on both.

## 2026-09-16 — The second preset's id is colour-neutral: `mono`

**Decision:** the second preset is black text with a white outline again, and its
id is now `mono` rather than naming either colour.

**Why the rename:** this look inverted three times in one session while its
reference was being settled (white-on-black -> black-on-white -> white-on-black
-> black-on-white). The id is the stored value, so each flip cost a migration
purely to keep the name honest. `mono` describes the pairing rather than which
half is which, so the next inversion is a code change and nothing else.

**Migration `20260916270000_movie_recap_subtitle_mono_preset.sql`** maps both
previous values (`white`, `black`) to `mono` and narrows the check constraint to
`('yellow', 'mono')`.

**Rule this leaves behind:** a preset id names the ROLE of a look, not its
colours. `yellow` is a borderline case kept as-is because that colour is the
point of it — it is the reference caption's signature — but a new preset should
be named for what it is for.

## 2026-09-16 — A narration beat cuts between several shots

**Problem:** the pacing dragged. Every narration line held ONE clip for its whole
length, so a 5-second line meant a 5-second static shot. Real recaps cut every
second or two underneath a continuous line.

**Decision:** a beat is now a group of scenes, not one scene.
`generateMovieRecapNarration` returns `{ sceneIndexes: number[], text }` and the
prompt asks for 2-4 scenes per beat that belong together, in order. The render
cuts between them while the beat's single line of speech plays over the top.

**Why the model groups them rather than the render:** grouping is an editorial
judgement — which shots belong to the same moment — and the model is the only
part of the pipeline that knows the plot. A render-side rule would cut wherever
the clock said, including across an unrelated scene. (The alternative was
offered and rejected for that reason.)

**`planBeatShots()` decides how many of a beat's scenes it can afford**: roughly
one cut per `SHOT_TARGET_S` (1.5s), floored at `MIN_SHOT_S` (1s). Scenes the line
is too short to pay for are dropped rather than squeezed — the model picks scenes
before anything knows how long the synthesized line will run, so over-supply is
normal and has to be absorbed somewhere. It is exported and unit-tested because
the arithmetic decides every cut in the video.

**`ceil`, not `round`, on the shot count.** A test written first with `round`
caught it: at 2s of speech, rounding gives ONE 2s hold, which is precisely the
dragging pace this change exists to remove. Ceiling gives two 1s cuts, and the
`MIN_SHOT_S` floor stops that bias from producing flicker.

**Timeline consequence:** `beatDurations` (one entry per beat) is now separate
from the clip list (one entry per shot). The narration track pads each line out
to its BEAT's length — the sum of its shots — so speech starts with a beat's
first shot and keeps playing across its cuts. Confusing the two arrays would
desynchronize audio from picture for the rest of the video.

**Also changed:** a mock render now builds two shots per canned line, so mock
exercises the cutting path instead of only the single-shot case. Scene reuse is
rejected at map time — first use wins — because the same footage under two
different lines reads as a bug even when the model does it deliberately.

**Not verified end to end yet:** no real render has run through this.

## 2026-09-16 — Second pacing pass: a hold cap, and unused scenes get borrowed

Review of a rendered 37s recap: median shot ~1.4s, which matched the target, but
three things stood out. Two were real.

**Real: 3-4s holds remained.** `slotS = targetS / shotCount`, so a beat the model
gave one or two scenes, carrying a 4-7s line, sat on a frame. Fixed with
`MAX_SHOT_S` (2.4s) and a borrowing pass: before planning, a beat pulls unused
scenes — the ones the model passed over — until it has enough to cut without
exceeding the cap, taking whichever are nearest in time so borrowed footage still
belongs to that stretch of the film. Shots are re-sorted chronologically
afterwards. If the pool is empty the hold stands: repeating footage inside one
beat looks worse than a long shot.

**Real: beats could group near-identical angles.** Nothing in the prompt said the
scenes in a beat should look DIFFERENT from each other, so two shots of the same
person at almost the same framing were a legal grouping. The prompt now asks for
a new subject, place, or clearly different framing within a beat.

**Not real: "some cuts are 0.4-0.7s, raise the minimum to 0.8s."** `planBeatShots`
cannot emit a shot under `MIN_SHOT_S` — `affordable = floor(targetS / MIN_SHOT_S)`
caps the count, and `targetS` is itself floored at 1s by the cue timing. Any
sub-second cut in the output is a cut INSIDE the source footage that scene
detection missed, so one of our ~1.4s clips contains an original edit. Measuring
the output counts those as ours. Raising the floor would not touch them and would
only license genuinely faster cuts. Left at 1.0s.

`SHOT_TARGET_S` moved 1.5 -> 1.4. Tests cover the hold cap, the floor, and the
single-scene fallback.

## 2026-09-16 — Azure's own silence was pacing the video

**Bug:** a rendered recap had ~0.95s of dead air after every narration line —
19.7% of a 23.65s video. It was not padding added by the render.

**Cause:** Azure returns each clip with silence baked in. Measured on one
4.85s clip: 0.18s before the speech, 0.81s after it. `durationSeconds` is the
file's duration, that duration sizes the beat, and the picture therefore holds
through silence the render never chose to add.

**Fix:** `trimToSpeech()` cuts each clip back to its speech (silencedetect,
-40dB, with a 60ms margin either side so a soft syllable cannot be clipped) and
the trimmed length is what sizes the beat. One deliberate `BEAT_GAP_S` (0.15s)
is then added between beats, and none after the last — a recap should not end on
dead air. The gap is now uniform and chosen, rather than whatever the TTS felt
like appending.

**Trap, caught by dry-running the parser against a real clip:** silencedetect
closes the FINAL silence run at EOF rather than leaving it open, so testing for
"a start with no matching end" finds nothing and the tail survives. The first
version of this saved 0.12s instead of 0.86s. The test is whether the last run's
END lands on the end of the file.

**Also:** the narration prompt capped lines at 60 characters and the model was
writing 63-70. 60 characters is about four seconds of speech — a whole beat on
one thought. The cap is now 50 with the reason stated.

**Not fixed here:** the delivery rate itself is Azure's default. Measured 16.5
Burmese characters per second across five beats. `rate` is already plumbed
through `AzureVoiceParams` if that needs to move.

## 2026-09-16 — Bug fixed: Contain was never saved

**Bug:** picking "Contain" in the customize step did nothing — the render still
cropped, and reopening the project showed "Cover" selected again.

**Cause:** `fitMode` was missing from the step-3 save payload in
`MovieRecapWizard`. The picker wrote it to local state, the PATCH route accepted
it, and the render honoured it (`scaleFilter`), so every part of the chain worked
except the one that put it on the wire. Nothing failed or logged; the value was
simply dropped between the click and the request.

**Worth noting for the next field:** that payload is a hand-written list of keys.
Every control added to step 3 has to be added to it by hand, and forgetting costs
a setting that appears to work in the UI and silently reverts. Check it whenever
a control is added, and be suspicious of "the UI shows my choice but the output
ignores it" — that is this shape of bug.

## 2026-09-16 — 16:9 caption size down again: 6.5% -> 3.4%

Landscape captions read large at 6.5% (47px), 4.8% (35px) and 4% (29px). Settled
at 3.4% — 24px, or 2% of the frame's width.

**This is below the comfortable floor for Burmese at 720p** and is a deliberate
call, not an oversight: at 24px the marks stacked above and below a letter start
closing into it, and the 0.14em outline (~3px here) does most of the work
separating the caption from the picture. The fix for wanting it smaller again is
not a smaller number — it is raising `TARGET_DIMENSIONS` to 1920x1080 so the same
relative size has more pixels to draw with (deferred; see "Output stays 1280x720
for now"). Portrait was checked at the same time and left at 2.5% — it
reads correctly in a real render.

The two ratios are now far apart as a fraction of width (2% landscape, 4.4%
portrait), which is right rather than sloppy: a portrait video is watched at arm's
length on a phone and a landscape one is not. The width rule stays as the starting
point for a NEW aspect ratio; for these two, the burned frame decided.

**Two process failures happened here, both worth avoiding.** The first attempt at
this change used a string replace whose anchor did not match, with no assertion,
so it reported success and changed nothing — twice in a row. Any scripted edit to
a constant needs an assert on the anchor and a read-back of the result.

The second: the no-op was "confirmed applied" by measuring a screenshot and
comparing against an ink-height estimate of 1.68x the font size. That ratio came
from a different sample string; this one runs about 1.46x, because how far Burmese
ink exceeds the font size depends entirely on which marks stack in that particular
line. Ink height is not a reliable way to infer font size across strings — read
the constant, or measure the same string both times.

## 2026-09-16 — Copyright-free is a per-project toggle again (supersedes)

Supersedes "Copyright-free transformation is mandatory, not optional", which
removed this toggle and dropped its column. Reinstating it was flagged as
contradicting that entry and approved before any code was written.

**Decision:** `copyright_free` is back as a boolean on the project row, editable
from a switch in the Customize Video tab's aspect section, defaulting to TRUE —
unlike the original column's `false`, because every existing project was created
under the "always transform" rule and true is what they were promised.

**What it does NOT do yet:** nothing branches on it. The render logs the value and
carries on. There is no distinct copyright-free step to skip, because the transform
was never built as its own stage — what the export does today is trim each scene to
a slot much shorter than itself, which breaks source continuity as a side effect of
pacing rather than as a rule. A separate finding, recorded here for whoever builds
it: **nothing tracks contiguous source footage**, so consecutive adjacent scenes
played near their own length would reproduce the original continuously, and a
`MAX_CONTINUOUS_SOURCE_S` guard does not exist.

**The old entry's objection still stands and is now a live risk:** a column that
nothing reads is dead weight, and that is exactly what this is until the transform
is defined. It is intentional and short-lived — the behaviour is being specified
next — but if that specification does not arrive, this should come back out rather
than sit as a switch that changes nothing.

## 2026-09-16 — The copyright-free transform, and where it lives

**Decision:** the transform is a filter chain built per shot in
`lib/movie-recap-transform.ts`, gated entirely on `project.copyrightFree`. With
the toggle off, the output is byte-for-byte what it was before this existed.

Four steps, all mild on purpose — the aim is that the export is not a
frame-for-frame copy, not that it looks processed:

| Step | What | Scope |
| --- | --- | --- |
| zoom | magnify the FITTED picture by `copyrightZoom`, then clip to frame | both ratios |
| framing | blurred copy of the clip behind the letterbox bars | `contain` only |
| mirror | `hflip` | both ratios |
| colour | `eq` contrast 1.06, saturation 1.08, gamma 0.98 | both ratios |

**Why a separate module rather than growing `scaleFilter`:** the render decides
WHICH source plays and for HOW LONG; the transform decides what it looks like.
Splitting them means a new visual step is one entry in one file, and the builder
is a pure string function, so it is tested without ffmpeg.

**The boundary that matters:** `ShotFilterContext` deliberately excludes the
shot's timing. Any transform that changes a shot's DURATION — a forced speed
change, a freeze cadence, a source-continuity limit — cannot live here, because
the planner has to know about it to keep the picture aligned with the narration.
That is the line to check before adding the next one.

**Blurred backfill is gated on the toggle too,** at the user's instruction. The
argument for leaving it always-on for `contain` (black bars just look worse) was
raised and set aside: with the toggle off, `contain` letterboxes in black exactly
as it did before.

**Zoom was 1.08 first and read as no change at all** — on `cover` the framing
barely moves, because cover already crops to fill. 1.2 keeps the middle ~83% of
the frame. Much past that softens visibly at 720p, since a smaller kept region is
stretched further to reach full width.

**Two consequences worth stating:** mirroring reverses any text in frame — signs,
phone screens, burned-in captions from a source that already had them. And the
backfill encodes two scaled copies per shot, so `contain` renders cost roughly
1.3-1.6x the ffmpeg time of `cover` ones.

Verified by running both chains — cover and contain, with `setpts` appended as
the render appends it — through ffmpeg against a real file.

## 2026-09-16 — Zoom is a project value seeded from the fit mode, not a constant

**Decision:** `copyright_zoom` (real, 1-2, default 1) lives on the project row and
is set from a slider in the customize step. It is a DIVISOR on the source crop, so
**1 means no zoom** and higher is tighter; a project with the transform off carries
1, and the render skips the crop entirely at that value.

**Seeding:** turning the transform on, or changing the fit mode or aspect ratio
while it is on, sets the recommended value. It is keyed by fit mode AND aspect ratio, and only portrait
gets a real zoom: `9:16` is 1.56 contained and 1.05 covered, `16:9` is 1 in both.
Landscape cover already crops a landscape source to fill, and landscape contain
holds a portrait source in a narrow centre strip that zooming only eats into —
the bars stay the same width either way, because a centre crop preserves the
source's aspect ratio. Changing either driver returns the zoom to unset. Turning it off returns
to 1.

**Why seeding is tied to fit mode and nothing else:** the recommendation depends
on the fit mode, so a fit-mode change is the one edit that should overwrite a
hand-set zoom. Everything else leaves it alone. The slider labels itself
"recommended" only while it matches, so a hand-set value is visibly not the
default.

**Range stops at 2.** Past that the kept region is under half the frame, and
upscaling it to 1280 wide is visibly soft.

**Reminder that keeps being needed:** a centre crop preserves the source's aspect
ratio, so zoom does not shrink the letterbox bars on `contain`. It tightens the
subject inside them. Wanting the bars gone means `cover`, or a crop that changes
aspect — which this is not.

**The temporary preview-only slider added an hour earlier is gone**, replaced by
this one. The preview still shows zoom, mirror and colour as CSS, which is an
approximation: ffmpeg crops then upscales from source pixels, the browser scales
what it already drew, so the export is sharper than the preview at the same
number.

## 2026-09-16 — Zoom "unset" is null, and step payloads are field lists

**Bug:** a project arriving with copyright-free already on showed zoom 1.00x and
stayed there until the fit mode was switched back and forth. Seeding only ran on
explicit actions — the toggle, or a fit-mode change — and every existing row had
`copyright_free = true` with `copyright_zoom = 1` from two separate column
defaults, so nothing ever fired.

**Cause, underneath:** `1` meant two things — "no zoom, deliberately" and "never
chosen". No amount of seeding logic fixes an ambiguous value.

**Fix:** `copyright_zoom` is nullable. NULL means unchosen: the UI shows the
recommendation for the fit mode and the render uses it, via
`effectiveMovieRecapZoom()`. Toggling the transform, and changing fit mode while
it is on, now write NULL rather than a number — so the value tracks the fit mode
until someone moves the slider, and stays put afterwards. 1.00x is a real choice
again. Existing rows were reset to NULL by the migration.

**Rejected:** seeding on page load when zoom equals 1. It makes a deliberate 1.00x
impossible to keep — every reload would overwrite it — and writes to the user's
data without them touching anything.

**Separately: the step save payloads are now field lists** (`STEP_2_FIELDS`,
`STEP_3_FIELDS`) with a `satisfies readonly PatchableField[]` check, instead of
hand-copied object literals. The literal is what silently dropped `fitMode`: the
control worked, the value never left the browser, nothing errored. A name that is
not a patchable field is now a compile error, and adding a control means adding
one word.

**React Hook Form was considered for this and set aside.** The defect was the
hand-maintained payload, which a five-line field list fixes. RHF earns its place
when there is client-side validation, dirty-field tracking or an unsaved-changes
guard to build — none of which exist here — and it fits this component badly
today, because the project object is replaced wholesale by every server response
(`setProject(result.data)`), which would mean `reset()` on each one.

## 2026-09-16 — The source's own dimensions choose the framing

**Decision:** the browser already reads the source's dimensions when it reads the
duration, so they are now stored (`source_width`, `source_height`, both nullable)
and used once, at upload, to seed `aspect_ratio` and `fit_mode`: portrait source
-> 9:16, landscape -> 16:9, and `cover` either way, since the orientations match
by construction.

**Why seed only at upload:** a new project has no configuration worth protecting,
and re-seeding later fights the user — the mistake the zoom default made an hour
earlier. Nothing re-runs it. Replacing the source creates the values again because
that is a new upload.

**Why `cover` and not `contain`:** cover fills the frame by cropping, which is
correct exactly when the output orientation matches the source's.

**No warning when they later disagree.** A banner for "portrait source, landscape
output" was built and then removed: the ratio and fit controls sit next to a live
preview, so a user who does not like the result changes it there. A warning about
something visible, next to the control that fixes it, is noise. The helper behind
it went with it rather than sitting unused.

**Known limitation, deliberately not solved here:** `videoWidth`/`videoHeight` in
the browser ignore rotation metadata. A phone video shot in portrait commonly
reports 1920x1080 with a 90-degree flag, and the browser does not expose the flag,
so the suggestion can be exactly wrong for that file. It is a default the user can
change, and the honest fix is an `ffprobe` pass server-side after upload, where
the rotation IS visible. Worth doing when phone footage becomes a real input.

**Columns are nullable** because rows created before this, and any file whose
metadata cannot be read, legitimately have no dimensions — `movieRecapOrientationMismatch()`
stays quiet rather than guessing for those.

## 2026-09-16 — Bug fixed: the preview grew the letterbox strip when zooming

**Bug:** with `contain` and a zoom set, the step-3 preview and the rendered output
disagreed — the render looked like no zoom had been applied, the preview like a
lot had. Reported the other way round ("preview zoomed, render did not"), which is
what made it worth measuring: on a 1722x720 source in a 9:16 frame, the preview's
strip measured 355px where 224px was correct, a factor of 1.58 against a zoom of
1.56.

**Cause:** the preview scaled the whole `<video>` element with CSS `transform`.
That enlarges the LETTERBOXED STRIP along with the picture. The render crops the
source before fitting it, and a centre crop preserves the source's aspect ratio,
so the strip's size never changes — only how much of the picture survives inside
it. The render was right.

**Fix at the time:** the preview drew a box at the SOURCE's aspect ratio, clipped
it, and scaled the video inside — what crop-then-fit looks like.

**Then reverted the same day**, because the RENDER changed instead: zoom now
magnifies the fitted picture (see the entry below), so a plain CSS transform on
the fitted video is the correct emulation again — the strip grows, the bars
shrink, the sides leave the frame. The source-aspect box held the bars still and
cropped all four sides, which was right for the old render and wrong for the new
one.

**The lesson worth keeping:** the preview emulates the render, so it has to be
re-derived every time the render's filter ORDER changes, not just its values. Two
renderers expressing one rule in different tools will drift silently otherwise —
and both times here, the drift looked like "zoom is broken" rather than "the
preview is stale".

**The general shape of this:** the preview is CSS and the render is ffmpeg, so
every visual rule has to be expressed twice, in tools that do not agree. When they
disagree, measure a burned frame against the preview rather than deciding from
memory which one looks right — the render is the output, so it wins by default,
but only measurement says which one moved.

## 2026-09-16 — Zoom magnifies the fitted picture, not the source (supersedes)

**Decision:** zoom is applied AFTER framing, not before. The earlier version
cropped the source and then fitted it, which is why a zoomed `contain` render
looked untouched: a centre crop preserves the source's aspect ratio, so the
letterbox bars stay exactly as wide however far you zoom — the picture just loses
its edges inside unchanged bars.

Scaling the fitted result instead makes the picture grow into the frame and the
bars shrink, which is what the preview already showed and what was wanted.
Measured on a 1722x720 source in a 720x1280 frame:

| zoom | picture inside the frame |
| --- | --- |
| 1.00 | 720x301 |
| 1.56 | 720x468 |
| 3.00 | 720x902 |

Width clamps at the frame (`crop=min(iw,W):min(ih,H)`), so a large enough zoom
becomes a full-bleed crop — the sensible end state rather than an error.

**Trap that nearly shipped:** those `min()` expressions contain commas, and
ffmpeg reads an unescaped comma in a filter chain as a filter separator — it
fails with `No such filter: '720):min(ih'`. The escape has to survive the
template literal, where `\,` COLLAPSES to a bare comma; it needs `\\,` in
source to emit `\,`. The first version emitted bare commas and would have broken
every render with the transform on. Caught by printing the generated string and
running it through ffmpeg, not by reading it.

**Worth repeating:** a string that is correct in the editor is not a filter that
runs. Print it, then run it.

## 2026-09-16 — Speed is an input, so no shot plays at the source's own speed

**Decision:** with the transform on, every shot plays at a speed drawn from
`MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` (0.94, 0.96, 1.05, 1.07) — never 1.0.

**The inversion that makes it cheap:** duration matching used to DERIVE the speed
from how long a shot had to last, which left most shots at the source's own speed
(the trim and freeze-pad branches both play at 1.0). Now the speed is chosen
first and the LENGTH OF SOURCE TAKEN absorbs it:

```
window = slot x speed      seconds of source taken
setpts = PTS/speed         played at that speed
output = window / speed = slot
```

The output is still exactly the slot, so the planner, `beatDurations` and the
narration track are all untouched. That is why this needed no timing work.

**Deterministic, not random.** `pickShotSpeed()` hashes the project id and the
shot's position, so a re-render of the same project produces the same file — the
same reason the voice profiles carry fixed seeds. Neighbouring shots land on
different speeds, and both directions appear, so a render never comes out
uniformly faster than its source.

**Trap, caught by measuring rather than reading:** `-ss`/`-t` after `-i` are
OUTPUT options, applied after the filter chain — so `setpts` has already re-timed
the stream and the window means something else. A 1.4s slot came out 1.30s at
0.94 and 1.47s at 1.07. The fix is input-side seeking (`-ss`/`-t` before `-i`),
plus a `tpad` hold and an output `-t` that cuts back to exactly the slot; that
also absorbs the frame of rounding a speed change leaves at 30fps. Verified at all
four speeds: 1.400 every time.

**Only the copyright-free path changed.** With the toggle off the original hybrid
— speed-ramp inside the band, else trim or freeze — is untouched.

**Side effect worth knowing:** this partly covers the unbuilt source-continuity
item. A run of adjacent scenes is no longer a faithful copy of the original once
each one plays at a different speed.

## 2026-09-17 — The thumbnail is grabbed from the SOURCE, and the button is a shuffle

**SUPERSEDED the same day — see "Hook titles replace the thumbnail" below. The
reasoning is kept because the mechanism is sound and will be the starting point
if cover art comes back alongside the frame-design work.**

**Decision:** the Review tab has a "Grab Thumbnail" button that pulls one frame
from the uploaded source video, runs it through the render's own filter chain,
and stores it on the project as `thumbnail_url` / `thumbnail_object_key` /
`thumbnail_at_seconds` / `thumbnail_attempt`. Pressing again grabs a different
frame. `POST movie-recaps/:id/thumbnail` takes no body.

**Why the source and not the render output:** cover art is wanted long before a
render exists, and a render costs minutes of local CPU plus Whisper and GPT
spend. The source is `ready` at the end of step one, so this button works from
then on. Taking the frame from the finished export was considered and rejected
for that reason alone — it would have been slightly more accurate (it would
carry burned subtitles) at the price of making a picture as expensive as a video.

**Why it still looks like the export:** the grabbed frame is passed through
`buildShotFilter(shotFilterContext(project))` — the same chain the render uses
per shot — so it comes out at the output aspect ratio with the copyright-free
zoom, blurred backfill, mirror and colour grade already applied. A thumbnail
showing the raw source would advertise a video that does not look like it. This
is the payoff for `lib/movie-recap-transform.ts` being a pure string builder with
no timing in it: a second consumer needed no changes to it.

**Why the source is not downloaded:** `-ss` placed BEFORE `-i` on an http(s)
input makes ffmpeg seek with HTTP range requests. Measured against a 149MB
source in R2: 1.7s wall clock, a few MB transferred, a 44KB JPEG out. The render
pipeline downloads the whole object because it reads all of it; this must not,
or the button inherits the render's cost profile.

**Why a shuffle rather than a fixed frame or a scrubber:** a fixed timestamp
picks a fade or an ident often enough to look broken, and a scrubber is a
control to build and explain before the user has seen a single frame. The button
re-presses instead. `thumbnailTimeFor()` steps by the golden-ratio conjugate, a
low-discrepancy sequence, so the FIRST FEW presses already sample the beginning,
middle and end — measured on a 131s source, presses one to four land at 65.7s,
20.5s, 93.6s and 48.4s. A linear step would have returned four near-identical
frames from the opening minutes. The first and last 5% are excluded, which is
where idents, fades from black and credits live.

**Why `thumbnail_attempt` is a position and not a success counter:** it is the
input to that sequence, so the stored value reproduces the frame on screen and
the next press is guaranteed to move somewhere else. A counter of successes
would repeat frames after any failed press.

**Consequences a future reader should not mistake for bugs:**
- The thumbnail does NOT carry subtitles or the logo. Those are applied by the
  render in a final pass over the whole video, not per shot, and are not part of
  `buildShotFilter`.
- The old R2 object is deleted only AFTER the new one uploads, so a failed press
  leaves the previous thumbnail intact. The key is a fresh uuid every time,
  which is also what stops the browser serving a cached previous frame.
- A press that cannot decode a frame returns 502 and changes nothing — including
  `thumbnail_attempt`, so the same bad position is retried rather than skipped.
  If that turns out to be annoying on damaged sources, advancing the attempt on
  failure is the fix.
- The columns are server-written and deliberately absent from
  `MovieRecapProjectPatch`.

## 2026-09-17 — Hook titles replace the thumbnail, generated at the end of a render (SUPERSEDED 2026-09-18 — hook titles removed entirely; the thumbnail removal stands)

**Decision:** the source-frame thumbnail is removed — code, route, UI and
columns — and replaced by generated Burmese hook titles. At the end of a
successful render the pipeline writes five title options to `hook_titles` from
the narration it just produced; the Review tab lists them and the user's pick is
stored in `hook_title`.

**Why it replaced rather than joined the thumbnail:** requested directly, one
day after the thumbnail shipped and before anyone had used it. The columns were
dropped rather than left in place precisely because nothing depended on them
yet; dead schema outlives the memory of why it is dead. The forward migration is
kept and a second migration drops the columns, because the first had already
been pushed — an applied migration is walked back, not deleted.

**Why the render writes them, not a button:** the input is the narration script,
which only exists once a render has run, and the render already has it in
memory. Generating at the end of the pipeline costs one small GPT call at a
moment the user is already waiting, instead of a press that would have to reload
the script to do the same thing.

**Why five options rather than one:** a hook is judged by comparison, and asking
for five costs the same single request as asking for one. The prompt explicitly
demands different ANGLES — a question, a stake, a twist, a character, a
consequence — because the observed failure mode is five rewordings of one
sentence, which defeats the point of returning several. It also forbids
revealing the ending, which the model otherwise does reliably; a title that
gives away the twist replaces the video instead of selling it.

**Why `hook_titles` and `hook_title` are separate columns:** the generated set is
server-written and replaced by each render, while the choice is the user's and
must survive a re-render that produces a different set. Collapsing them into an
index into the array would break the moment the array changed.

**Consequences a future reader should not mistake for bugs:**
- A failed title call leaves `hook_titles` UNTOUCHED rather than blanking it.
  Re-rendering is currently the only way to get titles, so a transient GPT
  failure must not destroy the set from the previous render. The render itself
  still succeeds — the video is the deliverable and it is already uploaded by
  this point.
- A cancel during the title call is re-thrown rather than swallowed, or
  "Cancel" would report a finished render.
- Choosing a title does NOT set `changesConfiguration` in the PATCH handler, so
  it cannot demote a `ready_for_generation` project back to `draft`. It does not
  change what the render would produce.
- A mock render writes `MOVIE_RECAP_MOCK_HOOK_TITLES` and spends nothing, the
  same contract as its canned narration.
- Length is clamped in code, not trusted from the model: a strict JSON schema
  guarantees an array of strings but not how many or how long. Measured output
  clusters at 44-52 Burmese characters against a stated 20-45 preference and a
  55 hard cap, so the cap is what actually holds the line.

## 2026-09-17 — Reverted: the +10% speech rate and the 30fps segment resample

**PARTLY UNDONE the same day — the 30fps resample was re-applied, see "Re-applied"
below. Only the +10% speech rate is still reverted.**

**Decision:** `c18d550` (Azure narration at `+10%`) and `cf79207` (resample every
segment to 30fps before concat) were both reverted at the user's request, as
`git revert`, so they remain in history and can be re-applied. The reason for the
revert was not stated; do not assume either change was found to be wrong.

**State after the revert:** narration speaks at Azure's default rate, the
committed voice previews are the default-rate files again, and segments are
concatenated at whatever frame rate `setpts` leaves them with.

**The measurements are kept here, because they cost real work and the second one
describes a bug that is now present again:**

- **Rate.** The same Burmese line measured 6.825s at Azure's default and 6.204s
  at `+10%` — a 9.1% cut, exactly `1/1.1`. Azure treats the percentage as a rate
  multiplier, not a duration one. Changing the rate requires re-running
  `scripts/generate-voice-previews.ts`; the previews are committed files.

- **Stutter — re-fixed, see below; this described the branch between the revert
  and the re-apply.** `setpts` re-times frames without
  resampling them, so a shot played at 0.94 carries about 40 frames across a
  1.4s slot where a full-rate shot carries 42 (an average 28.57fps against 30).
  `concat -c copy` cannot reconcile two frame rates, so those frames are held for
  two frame periods. Measured by dumping `frame=pts_time` from the concatenated
  file: four double-length gaps (0.0667s against 0.0333s), all inside the two
  slowed segments — two stutters per slowed shot, on roughly half the shots
  whenever `copyright_free` is on. Appending `fps=30` after `setpts`/`tpad` on
  every segment branch fixed it completely (42 frames at 30fps for all four
  speeds, one uniform gap). `cf79207` has the implementation.

- **Diagnostic note:** `r_frame_rate` reports 30 for every segment and hides this
  entirely. Only `avg_frame_rate` and the raw frame timestamps show it.

## 2026-09-17 — Transcription audio is compressed, because WAV capped the feature at 13 minutes

**Bug, found before it was hit:** the render extracted 16kHz mono PCM for
Whisper. That is 32,000 bytes a second against Whisper's 25MB upload limit, so
any source longer than **about 13.6 minutes** failed the transcribe step. Every
test source so far had been 60-131 seconds, which is the only reason it had not
surfaced — and the feature exists to recap feature-length films, which are 7-11x
over the limit.

**Fix:** extract Opus at 16kbps mono instead (`-c:a libopus -b:a 16k`). Measured
on the same 131s source: 4,204,190 bytes of WAV against 245,693 of Opus, which is
1,870 bytes a second and puts the ceiling near **3.9 hours**.

**Why Opus and not MP3 or AAC**, projected to a two-hour film from the same
measurement: Opus 12.8MB, MP3 13.8MB, AAC 21.2MB. AAC was rejected for leaving no
margin. All three were confirmed to be *accepted* by Whisper — that was tested,
not assumed, by transcribing each.

**Quality cost, measured rather than asserted:** the same clip transcribed as
WAV, Opus and MP3 returned the same dialogue apart from one proper noun
("Anderton's" became "Hannityd's" under Opus and "Anna and his" under MP3).
Segment counts differed (60/43/54), so cue granularity shifts slightly. Accepted
because the narration prompt summarizes rather than quotes, and because the
alternative is the feature not working on a real film.

**A size check runs before the upload** and throws a message naming the limit.
The ceiling is wide but not infinite, and Whisper's own error for an oversized
upload does not say what to do about it.

**Not done — chunking.** Splitting the audio and stitching segment timings would
remove the ceiling entirely rather than raising it. It was not needed once the
ceiling passed any plausible film length, and the size check makes the failure
legible if one ever exceeds it.

**Host requirement:** the ffmpeg build now needs libopus. Verified present in
both Homebrew's plain `ffmpeg` and `ffmpeg-full`, so this adds no setup step;
noted in the README beside the libass check.

## 2026-09-17 — The source's own subtitle track is used instead of Whisper, when it has one

**Decision:** before extracting audio, the render probes the source for a text
subtitle stream (`lib/movie-recap-captions.ts`). If it finds a usable one, it
converts it to SRT, parses it into the same `{start, end, text}` shape Whisper
returns, and skips transcription entirely. Otherwise nothing changes.

**Why:** when a source carries captions they beat transcription on every axis —
exact wording, exact timings, no API call, no upload limit, no minutes of
waiting. Nothing downstream can tell the difference, because `dialogueForScene`
only ever saw that shape.

**It is an optimisation, never a replacement.** Most sources have no subtitle
stream — a download or a cutter export usually strips it — so every path fails
soft and returns null rather than throwing. Verified both ways against real
files: a source with a muxed `mov_text` track returned 15 correctly timed cues
with markup stripped and the language detected, and the same source without one
returned null and transcribed as before.

**What is deliberately rejected, and why each would otherwise look like it
worked:**
- **Bitmap subtitles** (`dvd_subtitle`, `hdmv_pgs_subtitle`, `dvb_subtitle`) are
  pictures of words. ffmpeg cannot convert them to text; asking it to would
  produce an empty file rather than an error. Reading those needs OCR.
- **Forced tracks** translate isolated foreign lines, so they are not the film's
  dialogue. Used as if they were, they would hand the narration model a few
  percent of the runtime while appearing to have succeeded.
- **Burned-in subtitles** cannot be detected at all — they are pixels, not a
  stream.
- **Tracks that cover almost nothing.** A second net behind the forced check:
  under 10 cues or under 5% of the runtime falls back to transcription.

**Stream choice:** a stream marked `default` wins, then the first text stream —
the order a player would pick in. Language is logged but not filtered on, since
dialogue in any language is equally useful as context to the narration model.

**Cue text is stripped of styling** (`{\\an8}`, `<i>`, `<font>`) before it reaches
the model, and a cue's internal line breaks become spaces — those are
typesetting, not sentence structure. A cue whose timing will not parse is
dropped rather than guessed at: a wrong timestamp attaches dialogue to the wrong
scene, silently.

**Also in this change:** the Whisper path moved into `transcribeSource()` so the
pipeline reads as the single choice it now is — use the source's captions, or
listen to it.

**Consequence:** caption timings are the distributor's, not measured from the
audio, and some tracks run a little ahead or behind the speech. That is well
inside the tolerance here, since cues are only matched to scene ranges.

## 2026-09-17 — Re-applied: the 30fps segment resample, confirmed against a real export

**Decision:** `cf79207` is back (cherry-picked onto the caption work). The +10%
speech rate stays reverted; the two were reverted together but only this half was
wanted back.

**What settled it:** a rendered export from the app, measured rather than
watched. 1,987 frames over 33.9s with the gap histogram
`[(0.01667, 1936), (0.03333, 50)]` — **50 held frames**, every one exactly 2.0x a
frame period. That is the same defect the original entry describes, in real
output rather than a reconstruction.

**New information the export added:** the source was **60fps**, not 30. The
original diagnosis was made on a 30fps source, so this confirms the problem is
not tied to a particular source rate — any source whose frames do not survive
`setpts`/`tpad` at a constant rate produces it, and the output had inherited
59.98fps (`avg_frame_rate` 39740/679) where `r_frame_rate` claimed a flat 60.

**Also established, and worth not re-investigating:** everything else in that
export measured clean, so the stutter was the whole of the reported "glitching".
Narration silence was 2.33s of 33.95s (6.9%) in eight even 0.27s beat gaps;
median shot length 1.21s against 26 planned shots in 33.95s; subtitles, colour
grade, zoom and the region blur all correct.

**Method warning — scene detection on the OUTPUT is not a measurement.** At
`gt(scene,0.35)` it reported a 0.47s median shot and dozens of sub-0.1s "cuts",
which read as a second defect and is not one: sampling the frames around one
such "cut" showed a smooth continuous shot, the detector firing on fast motion.
At 0.6 it under-detects instead, missing real cuts between shots taken from
adjacent source. The trustworthy source of shot structure is the project's own
`render_script` column, which states the beats and their source spans outright.

**Consequence noticed while measuring, not a bug:** shots within a beat are cut
from ADJACENT source (beat 1 starts at 0s, 2.3s and 5.0s), so several cuts do not
read as cuts and the export shows 4-5s stretches that look continuous despite
three cuts. Each shot still takes only ~1.3s of continuous source, far inside the
5s ceiling, but the footage reads as less cut-up than the shot count implies.

## 2026-09-17 — REJECTED: shortening the narration lines in code

**Built, measured, and removed the same day at the user's direction: "prev beat
is more correct. we just only need to speed up the narrative speaking."** The
longer lines are the wanted content; the pace is a DELIVERY problem, not a script
problem. Do not rebuild this without asking.

The measurements below stand and are why the rate change exists, so they are kept
rather than deleted. The implementation is in git (a `shortenLongNarrationLines`
pass with two bounded rounds); it worked — 643 characters to 480, nine lines over
the cap down to two, speech 36.1s to 26.9s — it was simply not what was wanted,
because it bought that speed by throwing away narration.

## 2026-09-17 — (superseded) The narration length cap measurements

**Problem:** the finished recap still felt slow. Measured on a real ten-beat
export, the cause was the SCRIPT, not the delivery:

- Delivery was **17.83 characters a second** at Azure's default rate, against the
  16.5 recorded earlier as the baseline — if anything slightly fast, and that
  figure includes intra-line pauses, so the true articulation rate is higher.
- Line length was **49, 64, 58, 65, 65, 62, 68, 69, 72, 71** — mean 64.3 against
  a stated cap of 50. Nine of ten lines broke it.

Line length is what decides how long a beat stays on screen, so those lines were
the whole of the slowness: at 17.83 chars/sec, 64 characters is 3.6s against 2.8s
for 50.

**Why the prompt was not the fix:** it already said the right number. Asked for
60 the model wrote 63-70; the cap was lowered to 50 (2026-09-16) and it wrote
58-72. Two attempts at asking more firmly had already failed, so a third was not
tried.

**Decision:** `shortenLongNarrationLines()` runs after generation and sends back
only the lines that break the cap, asking for them shorter. The cap itself is one
exported constant the prompt interpolates and the check reads, so the two cannot
drift — which is how the cap quietly stopped meaning anything in the first place.

**Two rounds, because one is measurably not enough.** Measured on the real
script: one pass took nine over-long lines to five still over (643 to 536
characters); two passes reached **480 characters with only two lines over**, and
speech from **36.1s to 26.9s — a 25% cut**. It is bounded rather than looped to
convergence because the model plateaus, and spending calls to chase the last few
characters is worse than accepting a line that is close.

**For comparison:** the +10% Azure rate that was reverted was worth 9%. This is
worth 25%, and costs nothing in delivery quality. They compose if both are wanted.

**Guards, each protecting against a specific way the pass could make things
worse:**
- A rewrite is kept only if it is actually SHORTER. One that came back longer,
  empty, or unchanged is discarded — it has lost wording to no purpose.
- An index the model invented, or was never given, is ignored rather than
  clamped. Writing a shortened line onto the wrong beat would put narration over
  someone else's shots.
- A compliant script costs nothing: with no line over the cap, no call is made.
- The shorten prompt is told not to merge lines, drop them, or add information —
  a "shortened" line that loses the event its beat exists to narrate leaves those
  shots playing over something else.

**Unchanged and deliberately so:** the mock render still uses canned narration and
never calls this, so mock remains free.

## 2026-09-17 — Render progress is a stepper, and the failing stage is kept

**Decision:** the Review tab shows the render's progress as a seven-step bar
(`MovieRecapRenderProgress`) instead of one line of changing text. Steps fill
green as they complete, the running one spins, and a failed one turns red. The
detailed sub-label ("Describing scene 12/40") stays underneath, since the bar
shows WHERE the render is and the label shows how far through that step.

**Why the thirteen stages are grouped into seven steps** — both reasons would
otherwise put steps on screen that never happen:
- `reading_captions` and `extracting_audio`/`transcribing` are ALTERNATIVES, not
  a sequence: a source with subtitles never transcribes, one without never reads
  captions. As a single "Dialogue" step, either path fills it.
- Thirteen dots is a wall of text, not a progress bar.

`MOVIE_RECAP_RENDER_STEPS` is the single source of order, and a test asserts
every stage the pipeline can report belongs to a group — an ungrouped new stage
would silently read as "not started" while it ran.

**A mock render's skipped steps are shown as SKIPPED, not done.** A mock uses
canned narration and touches no model, so Source/Scenes/Dialogue/Script/Narration
genuinely do not run. They stay struck through even once the render finishes:
a bar claiming a mock "transcribed the dialogue" would be a lie told by a
progress bar.

**Consequence — `markFailed` no longer clears `render_stage`.** It is the only
record of where a render failed, and the bar marks that step red. Clearing it
left a failed render showing a bar where nothing had started. The progress
COUNTERS are still cleared, because "scene 12 of 40" is meaningless once the run
is over.

**An unrecognised stage marks everything pending rather than guessing.** A bar
that has not started is better than one claiming work that never happened.

**Not verified in a browser:** the Chrome extension was not connected, so the
layout was checked by build and unit tests only. The state logic is pure and
tested (`lib/movie-recap-steps.test.ts`); the visual arrangement was not.

## 2026-09-17 — Re-applied: +10% narration rate, and why not more

**Raised to +15% the same day — see the entry below. The table here is still the
method; only the chosen row changed.**

**Decision:** `AZURE_NARRATION_RATE = "+10%"` is back (the half of `c18d550`
that was reverted in `d7ab62d`). The narration lines are left exactly as the
model writes them — the recap is paced by speaking faster, not by saying less.

**Why +10% and not more, measured rather than guessed.** Running the real
`planBeatShots()` over the ten beat durations from the last export shows where
raising the rate starts costing scenes:

| rate | speech | shots | scenes dropped |
|------|--------|-------|----------------|
| +0%  | 36.1s  | 27    | 2 |
| +10% | 32.8s  | 27    | 2 |
| +15% | 31.4s  | 25    | 4 |
| +20% | 30.1s  | 24    | 5 |
| +30% | 27.7s  | 22    | 7 |

**+10% is free.** It is the last rate that changes nothing about the edit: the
same 27 shots, the same 2 scenes dropped as at Azure's default. Past it, shot
count is `ceil(beatDuration / SHOT_TARGET_S)` and shorter beats buy their speed
by discarding scenes the narration model deliberately chose — +15% buys only
1.4s more than +10% and costs two of them.

This supersedes the earlier "+10% and not more" reasoning, which guessed at
"around +15% that starts biting". The guess was roughly right; this is the
measurement, and it also gives the method for re-deciding if `SHOT_TARGET_S`,
`MIN_SHOT_S` or typical line length ever change.

**Still true from the first attempt:** Azure treats the percentage as a rate
multiplier, so `+10%` is a 9.1% duration cut (measured 6.825s against 6.204s on
the same line), and the committed voice previews must be regenerated with
`scripts/generate-voice-previews.ts` or the play button demonstrates a delivery
the render no longer produces.

## 2026-09-17 — Narration rate raised to +15%, spending two cuts for the pace

**Decision:** `AZURE_NARRATION_RATE = "+15%"`, chosen over the "free" +10% after
being shown what the extra costs. Measured on the same line: 6.825s at Azure's
default, 6.204s at +10%, **5.933s at +15%** — a 13.1% cut, exactly `1/1.15`.

**What it costs, from the table in the entry above:** shots over ten real beats
go from 27 to 25. Two beats hold one scene fewer.

**What it does NOT cost, which is the distinction that made the choice easy:**
no narration is lost. Every line is still spoken in full — that was the whole
point of rejecting the line-shortening pass. Raising the rate only reduces how
many visual cuts a beat can afford, because shot count is
`ceil(beatDuration / SHOT_TARGET_S)` and the beat is shorter.

**So the trade is picture, not script:** a faster read against slightly longer
holds per shot. +10% was the last rate that changed nothing about the edit; +15%
is the first that spends something, and it was judged worth it. +20% was
available and declined — it buys only 1.3s more than +15% and costs another cut.

**Unchanged:** the previews are committed files and were regenerated again
(`scripts/generate-voice-previews.ts`), shrinking a further ~4%.

## 2026-09-17 — Hard rule: no source footage on screen for more than 3.0s (SCOPED to 9:16 on 2026-09-17, below — 16:9 uses 4.0s; the invariant and its three enforcement points are unchanged)

**Requirement, stated by the user as non-negotiable:** no source clip may appear
for more than 3.0 seconds continuously in the final recap. The pacing targets
(`SHOT_TARGET_S` 1.4, `MIN_SHOT_S` 1.0, `MAX_SHOT_S` 2.4) are explicitly NOT the
lever and are unchanged — so the measured `+15%` narration-rate table in the
entry above still stands.

**The old planner had a target, not a rule, and two things got past it:**

1. **Supply ran out.** `planBeatShots` capped its count at `shots.length`, and
   the borrowing pass topped a beat up only while `spareScenes` had entries. An
   empty pool meant one scene carried the whole beat — the previous tests
   asserted a 6s and a 7s hold as correct behaviour.
2. **Source-contiguous shots played back to back**, which no per-shot cap can
   see. Borrowing took the spare NEAREST in time, which is usually the
   immediately adjacent scene; shots then sort chronologically, so scene A
   played to its end and scene B started exactly there. Two "cuts", one
   unbroken run of footage. The user confirmed this counts as continuous.

**Decision: `MAX_CONTINUOUS_SOURCE_S = 3` is an invariant on a RUN of shots**, not
on one shot, and it lives with the planner in the new `lib/movie-recap-shots.ts`
(extracted from the render, which is why `movie-recap-shots.test.ts` had that
name already). Enforced in three places:

- **Borrowing prefers a non-adjacent spare.** Nearest-in-time still decides, but
  a spare that butts up against footage the beat already holds is skipped while
  a non-touching one exists.
- **Cut count is floored** at `ceil(targetS / MAX_CONTINUOUS_SOURCE_S)`.
  `MIN_SHOT_S` never fights it: `floor(t/1) >= ceil(t/3)` for every `t >= 1`.
- **A continuous run is pulled apart** by moving a window INSIDE its own scene —
  start the later shot further in, or end the earlier one sooner — never by
  reordering. This preserves "cuts play in the order they happen in the film"
  (2026-09-16), which was the alternative and was rejected again here.

**Continuity is measured on played source, not on the slot.** A trimmed shot
shows less of its scene than the slot suggests, a freeze-padded or speed-ramped
one shows all of it, and the copyright-free transform takes `slot * speed`.
`playedSourceSeconds()` mirrors the render's four ffmpeg branches, and
`SPEED_RAMP_MIN/MAX` moved into the planner so the two cannot disagree. Getting
this wrong in either direction is invisible: too strict and it cuts footage
apart that already had a jump in it; too loose and the invariant silently fails.
It is also why the planner takes the speed callback rather than assuming 1.0.

**Supersedes:** *"If the pool is empty the hold stands: repeating footage inside
one beat looks worse than a long shot"* (2026-09-16). The hold no longer stands.
But the reason it was written still holds, so the fallback is NOT reuse:

**Fallback is sub-splitting one scene into non-contiguous windows.** A scene of
length D yields k windows of one slot each, spread evenly with at least
`MIN_JUMP_S` (0.5s) skipped between them — different footage each time, so
nothing is shown twice, and it reads as a jump cut rather than a hold. Reusing a
scene from elsewhere in the film was offered and declined for the recorded
reason.

**When it is arithmetically impossible** — one short scene under a long line,
nothing to borrow, nothing long enough to split — the plan carries a `warning`
and the render logs it per beat. It does not pretend. Measured over a 540-case
grid this is ~5% of synthetic combinations and all of them are 1-second scenes;
with `detectScenes` keeping up to 300 scenes and a recap using ~30, it should not
occur on a real source.

**Consequence a future reader will mistake for a bug:** breaking a run by ending
the earlier shot sooner shortens its window below its slot, so that shot gains
freeze-padding it did not have before. That is deliberate — the freeze is bounded
by the slot, which is bounded by 3s, and a held frame with a cut after it beats
an unbroken 4s of source.

## 2026-09-17 — Speed set narrowed to 0.96-1.07, and the dead zone widened to +-3% (superseded by the slow-only set 2026-09-17, below; the dead zone and the +-7% bound stand)

**Decision:** `MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` is `[0.96, 0.97, 1.04, 1.07]`,
was `[0.94, 0.96, 1.05, 1.07]`. The rule it serves is unchanged and is the point
of the whole list: **no shot ever plays at the source's own speed** (2026-09-16,
"Speed is an input").

**Why narrower:** 0.94 is a 6% slowdown, which is the most visible value in the
old set and the one most likely to read as a slow-motion shot rather than as
nothing in particular. The range now sits inside 0.96-1.07 — still nowhere near
1.0, still invisible per shot.

**Why not 0.98, which was proposed:** it is inside the dead zone. 2% at 30fps is
under one frame of drift a second, so it is "not 1.0" on paper and untouched in
the picture — it spends a slot in the list without doing the job the list exists
for. The dead zone is recorded as +-3% now rather than +-2% for the same reason,
so the next edit does not re-argue it.

**Unchanged:** `pickShotSpeed()` and its hashing, the +-7% outer bound, and the
reasoning for both. This is a values change, not a behaviour one.

**Consequence:** speed decides how much source a shot consumes
(`slot * speed`), so it also feeds the continuity check in
`lib/movie-recap-shots.ts`. Narrowing the set slightly reduces how far a shot
runs into the footage after it. Nothing to tune — the planner reads the same
constant.

## 2026-09-17 — A shot plays the moment its scene was DESCRIBED from, not the head

**Problem, reported off a render:** "main part is cut out" — the shot is the
right scene but the wrong moment of it. The action the line is about happens
after what is on screen.

**Cause, and it predates the 3s work:** the render's trim branch took the HEAD of
a scene — `-to sourceStartS + slot`. Scene detection keeps scenes of at least 2s
and many run much longer, so a 6s scene under a 1.4s slot showed 0-1.4s. But
`extractKeyframes()` takes each scene's representative frame **a third of the way
in**, the vision pass describes THAT frame, and the narration model picks the
scene from that description. The pipeline was choosing scenes by one moment and
playing a different one.

**Decision:** the planner narrows each scene to the piece that will actually play
(`focusWindow()`), centred on the described moment and clamped inside the scene.
Everything downstream — the continuity check and all four ffmpeg branches — works
on that piece. `KEYFRAME_FRACTION` in the planner and the `/ 3` in
`lib/movie-recap-scenes.ts` are the same number and have to move together; a
comment on each says so.

**Consequences a future reader would otherwise read as bugs:**
- A window is now usually exactly its slot long, so `ratio` is 1 and the render
  takes the speed-ramp branch with `setpts=PTS*1.0000` where it used to trim.
  Same output.
- The "extreme duration mismatch" warning effectively only fires now for a scene
  SHORTER than its slot. The long-scene half of it was the case this fixed.
- Breaking a continuous run now prefers SLIDING a window inside its scene (it is
  only a slot-sized view of a longer scene, so sliding costs nothing) over
  shortening one, which was the previous first move.

**Bug caught while writing this, worth keeping:** a run's length is counted in
SCREEN seconds, not source seconds. A scene shorter than its slot is
freeze-padded, so 1s of source can occupy 1.7s of recap — two adjacent 1s scenes
are 3.4s of unbroken footage, not 2s. Counting source seconds silently let that
through, and the property test caught it on exactly that case.

## 2026-09-17 — Shots land in a 1.5-2.5s band: MIN_SHOT_S 1.5, SHOT_TARGET_S 2.0 (SCOPED to 9:16 on 2026-09-17, below — still the measured, authoritative short-form numbers)

**Measured, on the export the complaint came from** (19.7s, 720x1280, detected
with `detect-adaptive --min-scene-len 0.3s`):

```
20 shots, mean 0.98s, max 1.27s, nothing over 3s
[0.97, 0.97, 1.27, 1.03, 1.0, 1.0, 1.13, 1.13, 0.93, 1.17,
 1.0, 1.0, 1.17, 1.27, 1.23, 0.83, 0.3, 1.17, 0.93, 0.2]
```

So the file never had a hold problem — it had the opposite one. Almost every
shot sat on the `MIN_SHOT_S` floor, and an action or a line of dialogue does not
land in one second. (The 0.3 and 0.2 entries are cuts inside the source that
detection missed, per 2026-09-16 — not ours.)

**Cause of the clustering at 1.0s:** `shotCount = ceil(targetS / SHOT_TARGET_S)`
clamped by `floor(targetS / MIN_SHOT_S)`. At 1.4 and 1.0 the ceiling almost
always asked for one more cut than the beat could pay for, so the floor decided
the length and every beat came out at 1.0s.

**Decision, user's call:** `MIN_SHOT_S` 1.0 -> **1.5**, `SHOT_TARGET_S` 1.4 ->
**2.0**. Every beat length now lands in 1.5-2.5s:

| beat | shots | slot | | beat | shots | slot |
|------|-------|------|-|------|-------|------|
| 2.0s | 1 | 2.00s | | 4.5s | 3 | 1.50s |
| 2.5s | 1 | 2.50s | | 5.0s | 3 | 1.67s |
| 3.0s | 2 | 1.50s | | 6.0s | 3 | 2.00s |
| 3.5s | 2 | 1.75s | | 7.0s | 4 | 1.75s |
| 4.0s | 2 | 2.00s | | 9.0s | 5 | 1.80s |

**`MAX_SHOT_S` (2.4) is unchanged and is now only a borrowing target.** With the
floor at 1.5 it no longer binds the slot — a 2.5s beat gets one 2.5s shot,
because `floor(2.5 / 1.5) = 1`. The cap that actually binds is
`MAX_CONTINUOUS_SOURCE_S`, and the test that used to assert 2.4 now asserts 3.0.

**Supersedes** the 2026-09-16 "Left at 1.0s" reasoning. That entry was answering
"raise the minimum to 0.8 because the output has sub-second cuts" and was right
that the floor was not the cause of those. It did not consider raising the floor
to make shots longer, which is what was actually wanted.

**Invalidates the +15% narration-rate table** (2026-09-17, two entries up). That
table measured how many shots each rate costs, and its own text says to re-run it
if `SHOT_TARGET_S` or `MIN_SHOT_S` change — both did. The rate is left at +15%:
its trade was about narration delivery, not about cut count, and shot count is
now set by this band rather than by how long the speech runs. Re-measure before
moving the rate again.

**Consequence:** fewer shots per beat, so more of the scenes the narration model
picked get dropped (they are dropped from the END of the beat, chronologically).
That is the price of the longer hold and was accepted knowingly.

## 2026-09-17 — A shot never plays across one of the film's own cuts

**Measured, on the export rendered with the 1.5-2.5s band in place** (20.57s):
detection found **21 cuts in a video the planner cut 11 times**. Merging the
detections back up to the 1.5s floor recovers the planner's own structure
exactly — `1.64, 1.63, 1.70, 1.70, 1.80, 1.80, 2.07, 2.07, 2.70, 1.83, 1.63` —
so the band was working. The other ~10 cuts came from the source: nearly half the
shots contained an edit from the original film, and a planned 1.7s hold arrived
as two pieces of ~0.85s. That is what still read as "too fast, the action is cut
out" after the pacing change.

**Cause:** `detectScenes` asked PySceneDetect for `--min-scene-len 2s` and
`condense()` merged anything shorter into the preceding scene. Both were right
for the CONSUMER of that list — one keyframe and one vision description per
scene, and a recap beat is never half a second long — but the merge threw the
cut list away, and the shot planner was handed 2s+ "scenes" that were not
unbroken footage.

**Decision: detect fine, merge for the model, keep the cuts for the planner.**
`detectScenes` now runs at `RAW_MIN_SCENE_S` (0.8s) and returns
`{ scenes, cuts }`: `scenes` is the same merged, `MAX_SCENES`-capped list the
vision pass and the narration model always got, and `cuts` is every boundary
detection found. Nothing about the scene list's shape changed — only that the
information thrown away is now also returned.

**`focusWindow()` splits its scene into uncut runs and plays inside ONE of them.**
It prefers the run holding the described frame — the same `/ 3` point
`extractKeyframes` samples, so the shot shows the moment the scene was chosen
for — and otherwise the nearest run long enough for the slot. The run is also
what `breakContinuity` may slide the window within, so opening a gap cannot push
a shot across a cut either.

**When no run is long enough, the shot plays across a cut anyway.** The
alternative was a shorter window freeze-padded out to its slot, and an original
edit inside a shot still looks like film while a held frame looks like a bug.
The described moment wins in that case.

**Not done:** `subSplit()` (the dry-spare-pool fallback) still ignores cuts, so
its sub-windows can straddle one. It is the rare path and its windows are short;
worth fixing if that path ever becomes common.

**How to re-measure this**, since the number only shows up in the finished file:

```bash
.venv-scenedetect/bin/scenedetect -i recap.mp4 -o /tmp/check \
  detect-adaptive --min-scene-len 0.3s list-scenes -f cuts.csv
```

Detected cuts materially above what the render logged (`beat=N ... -> K shot(s)`)
means source edits are leaking into shots again.

## 2026-09-17 — A shot lands on its liveliest second, and what "freeze" turned out to be

**False alarm first, because the method matters.** A render was reported as
freezing at 0:10 and 0:11. Measuring duplicate frames on a 64x48 greyscale
downscale found 9 frozen spans totalling 6.17s — 29% of the file. **All of it was
an artefact.** At 240x180 the same file has **zero** duplicate frames: no
`tpad` freeze-padding happened at all. A coarse downscale turns near-static
FOOTAGE into identical bytes. Measure freezes at 240x180 or finer, and treat a
scattering of single duplicate frames as the `fps=30` resample of 24fps source,
which is what it is.

**What was actually wrong:** motion, not freezing. Per-shot mean frame difference
on that export ran 10.6 and 12.1 for the opening two shots and 2.1-3.9 for the
rest. A 1.8s shot at a third of the opening's motion reads as frozen next to it.
The scenes were not static throughout — the window had simply been centred on the
described moment, which landed on a dead stretch of an otherwise moving scene.

**Decision:** the planner places a shot on the liveliest window inside its uncut
run. `focusWindow()` scores every candidate start on mean motion relative to the
RUN's own average, minus `MOTION_DRIFT_PENALTY` (0.15) per second of drift from
the described moment. Relative, so a quiet scene uses its own best second rather
than being written off against a loud one; penalised, so a marginal gain a long
way off is not worth leaving the described action for.

**The motion track is free.** PySceneDetect already decodes every frame to find
cuts; `-s stats.csv` makes it write the per-frame `content_val` it computed on
the way, and `parseMotionCsv()` averages that into 0.25s buckets. A separate
ffmpeg pass would have meant decoding a feature film a second time. It fails
soft: no stats file means no motion-aware framing, not a failed render, and the
scene log says `(no motion track)` when that happens.

**Order of authority, unchanged by this:** the uncut run is chosen first (by the
described moment, see the entry above), and motion only decides where to sit
INSIDE it. Motion can never pull a shot across one of the film's own cuts.

**Rejected:** shortening the slot for low-motion shots. It would have fought the
1.5-2.5s band chosen the same day, and the problem was where the window sat, not
how long it was.

## 2026-09-17 — Motion picks which scene, not just where inside it

**Correction to the entry above, and to how these files get measured.** The
"freeze" reports were real observations with three wrong diagnoses in a row:

- 64x48 greyscale, exact-duplicate test: 9 spans, 6.17s. Artefact.
- 240x180, exact-duplicate test: zero spans. Also wrong — `tpad` clones go
  through libx264 and do not decode back byte-identical, so an exact test misses
  real padding.
- 240x180 with a threshold: 9 spans, 7.47s, and the SAME answer at thresholds
  from 0.05 to 0.6. Still an artefact.

**The test that actually distinguishes them is full-resolution mean frame
difference.** Inside those spans it reads 2.4-5.8 against 9.6 for moving
footage; a real `tpad` clone reads ~0 even at full resolution. Downscaling
averages low-motion detail away, so slow footage and frozen footage become the
same number. **Do not measure freezing on a downscale.**

So nothing was being freeze-padded. The shots carried 25-60% of the opening's
motion and were held for a full 1.5-2s slot, which is what "not moving, then it
switches" was.

**Decision, two changes, both using the motion track:**

- **Borrowing picks the liveliest of the nearest spares.** The nearest
  `BORROW_CANDIDATES` (6) are taken by proximity — borrowed footage still has to
  belong to this stretch of the film (2026-09-16) — and motion only chooses
  between those. A lively scene an hour away can never be pulled in, and there
  is a test for that.
- **A beat that cannot afford all its scenes drops the deadest**, not the last
  one. `slice(0, shotCount)` dropped chronologically from the end, which meant
  the beat always lost the end of its own line — usually the payoff.

**Why this and not window placement alone:** the previous entry moves the window
to the liveliest second INSIDE a scene, which cannot help when the whole scene is
static. Choosing the scene is the lever that can.

**Not done, offered and declined for now:** rejecting a scene outright when its
motion falls below a fraction of the film's average. It is the strongest version
of this and also the one that can silently discard a scene the narration is
about.

**Both fail soft:** with no motion track (a mock render, or an unreadable stats
file) borrowing is nearest-first and dropping is last-first, exactly as before.

## 2026-09-17 — Bug fixed: motion-aware placement was hunting for cuts

**Reported:** "the freeze on shot is still happening, and the video got longer —
the worst generation since all the changes". Measured on that export (36.17s):

- **No freezing.** Zero clone frames at full resolution, and per-shot motion ran
  2.7-17.2 with one shot under 3.0. Nothing static enough to explain it.
- **Length is narration, not planning.** Beats are sized by measured TTS and the
  model writes a fresh script every render; 36.17s against the previous 20.97s is
  script variance. Nothing in the planner changes total length.
- **Source-cut leakage roughly tripled**: ~11 film cuts inside shots, against ~4
  the render before. That one was real, and mine.

**Cause:** the motion track is PySceneDetect's `content_val` — the metric it
THRESHOLDS TO FIND CUTS. It peaks hardest exactly at an edit. Inside a clean
uncut run that is harmless, but on the fallback path, where `room` is a whole
scene because no run was long enough, the candidate search could see cuts and was
drawn straight onto them. The scorer was rewarding the thing the rest of the
module exists to avoid.

**Fix, two parts:**
- `motionMean()` skips any bucket containing a cut. A cut is not movement.
- A candidate window pays `CUT_PENALTY` per cut inside it, so a cut-free
  placement always wins; when none is cut-free the penalty is what makes the
  search take the placement with the FEWEST cuts rather than the loudest one.

**Worth keeping in mind for any future use of this signal:** anything derived
from a cut detector's own metric carries cut spikes, and they will dominate any
average taken over a span that contains one.

## 2026-09-17 — "Freeze" means the picture holds still, and how to measure that

**What the word meant, after several wrong readings on my part:** not duplicate
frames, not `tpad` padding — the shot simply does not move. Both are worth being
able to measure, and they need OPPOSITE methods:

- **Freeze-padding (cloned frames):** full-resolution mean frame difference. A
  clone reads ~0; slow footage reads 2.4-5.8. Downscaling collapses the two.
- **"Nothing visibly moves":** DOWNSCALED difference (160x120 or so). Grain and
  compression noise average away and only gross motion survives. At full
  resolution grain keeps every frame "different" and hides it.

Measured the reported export both ways: **zero cloned frames, and 11.0s of 36.1s
(30%) with no visible motion**, in runs up to 1.30s — several whole shots still
for their entire length. The complaint was right; the first three measurements
were not.

**`content_val` can see it.** Cross-checked against the pixels on that export:
stretches the pixels call still read 0.08-3.8, moving ones 5.6-11.5, against a
film median around 4.2. Well separated, so the signal was fine and the scorer was
not.

**Cause: the window score was a MEAN.** A window that sat still for 1.5s and
twitched once for 0.3s scored the same as one that moved throughout. Fixed by
scoring `movingFraction()` — the share of a window's buckets at or above
`STILL_FLOOR_FRACTION` (0.8) of the film's median — with mean motion kept at
`MEAN_MOTION_WEIGHT` (0.25) only to break ties between windows that move for
equally long.

**Why the floor is relative to the film's own median** rather than absolute: a
grainy print and a clean one sit at different absolute levels, and an all-quiet
scene should still get its best second rather than being written off against the
rest of the film. There is a test for exactly that.

**Still open, and it is the ceiling on all of this:** placement can only move a
shot WITHIN its scene. When the scene the narration model picked is static end to
end, nothing here helps — that needs rejecting the scene and swapping in a spare,
which was offered and declined earlier because it can discard a scene the line is
about.

## 2026-09-17 — ROOT CAUSE: condense() never guaranteed a scene was long enough

**Symptom, reported precisely enough to find it:** "almost every shot becomes
frozen just before it switches." That is the signature of `tpad=stop_mode=clone`,
which pads the TAIL of a shot when its window is shorter than its slot.

**Proof, on the reported export.** The shot at 18.07-19.97 is 58 frames: 18 of
them move (cumulative difference from the first frame rises 0 -> 16.6), then 39
frames sit at exactly 16.6 — **1.30s of one held frame** — then the cut. 0.6s of
footage stretched across a 1.9s slot.

**Root cause, in `condense()`:**

```ts
if (previous && row.end - previous.start < MIN_SCENE_S) previous.end = row.end;
```

That measures the span from the PREVIOUS SCENE'S START, not the scene's own
length, so it never guaranteed what its name and comment claimed. It was
harmless for as long as detection ran at `--min-scene-len 2s`, because every raw
row already cleared the bar and the branch never fired. **Lowering
`RAW_MIN_SCENE_S` to 0.8s for cut-awareness turned a latent bug into a live one**:
raw rows became 0.8s, and merged scenes came out at 0.8-2.0s. Reproduced from the
rule alone — raw rows of 0.8s produce scenes of 0.9s, 1.4s and 1.6s.

**Fix:** test the merged scene's own length, and fold a short final scene back
into the one before it, since nothing follows it to merge in. Every scene is now
at least `MIN_SCENE_S`.

**Guards added, because this shipped silently:**
- Borrowing prefers a spare that can fill the slot before motion gets a say.
- A beat that cannot afford all its scenes drops the ones too short to fill the
  slot first, whatever their motion — a held frame is worse than a quiet one.
- `planBeat` totals how much of a beat has no footage behind it and returns a
  warning, which the render logs per beat.

**How the measurement went wrong four times, and what to trust.** Freezing was
measured as duplicate frames, first on a 64x48 downscale, then 240x180, then at
"full resolution" with `crop=iw:ih*0.72` — 1280 * 0.72 = 921.6, ffmpeg emits 921
or 922 rows, and the reader assumed 920. **Every frame was byte-misaligned, so
everything looked like motion and the conclusion was "no freezing at all."** Use
a crop whose height is an exact even integer, or scale to an explicit size, and
verify the frame count against the duration before believing any of it. The
`cumulative difference from the first frame of the shot` view is what finally
made the hold obvious, because a held frame shows as a dead flat line.

## 2026-09-17 — Render history is per-shot, and lives in localStorage

**Want:** a record, per generation, of how long each shot ran and how it compares
to the original — kept per project, listed under the rendered video, newest
first, deletable.

**Decision: the browser stores it, not the database.** A table was started and
stopped at the user's direction. This is a record of how one RUN turned out,
used to compare against the last one while iterating on settings; it is not
project data, nobody else needs to read it, and keeping it local means no
migration, no RLS policy, and no rows to clean up when a project is deleted.

**Consequence, stated because it will surprise someone:** the history is per
browser. It does not follow the user to another machine and clearing site data
clears it. Capped at 20 entries per project.

**So the shot log has to ride back on the render response.** `runMovieRecapRender`
now RETURNS it and the render route sends `{ ...project, renderLog }`. That
response is the only time the browser ever sees this data — nothing on the row
holds it, so a missed append is gone for good.

**What each shot records, and why these fields:** `slotS` (time on screen),
`sourceStartS`/`sourceEndS`/`sourceS` (which part of the original, and how much
of it), `speed`, `skipS` (source seconds jumped since the previous shot), and
**`padS` — seconds with no footage behind them, filled by holding a frame.**
`padS` is the reason the feature is worth having: the bug fixed earlier today
held a frame for 1.3s at the end of most shots and nothing in the product said
so. It is red in the table when above 0.1s.

**`useSyncExternalStore`, not an effect.** Reading localStorage into state in a
`useEffect` is what the lint rule `react-hooks/set-state-in-effect` exists to
stop, and it would have needed prop-drilling through `Review` as well. The store
in `lib/movie-recap-render-history.ts` keeps a cache keyed by project id — a
stable snapshot reference is what stops `getSnapshot` re-rendering forever — and
publishes to subscribers on append/delete/clear. `getServerSnapshot` returns a
shared empty array, since the store does not exist on the server.

**Every storage access is wrapped**, because `localStorage` throws in a private
window and returns nothing with site data blocked. A history that cannot be read
or written degrades to empty; it must never take a render down with it.

## 2026-09-17 — Narration is beat-level; it never scales per clip

**Principle, stated by the user and worth keeping at the top of any future
prompt work:** a narration line carries ONE story idea and its length comes from
that idea. Several clips may support the same line. The planner fits clips to
the narration — never the other way round.

**What was removed:**

> "A beat is cut into roughly 1.5-second shots, so a line spoken over four
> scenes wants about six seconds of speech — if a line is too short to give each
> of its scenes that long, the render drops the extra scenes."

It taught the model to budget narration by clip count. Its numbers were also
stale — shots are 1.5-2.5s now, not 1.5s.

**REJECTED, and this is the trap to avoid:** re-costing that sentence for the
current band, i.e. telling the model "each scene costs about 40 Burmese
characters, so write the line long enough to pay for the scenes you picked."
That was proposed here and turned down. It reads like a fix — the arithmetic is
correct, and it would make the model's scene choices survive instead of being
dropped — but it makes narration a function of clip count, which is precisely
the coupling that must not exist. A recap where every visual cut needs its own
chunk of narration is a list, not a story.

**What replaced it:**

> "Pick the scenes that show this beat. Supplying more than the render can use is
> fine — it keeps the ones that fit the line and drops the rest. Never lengthen a
> line to justify more scenes."

Over-supply was already absorbed — `keepLiveliest()` drops what a beat cannot
afford, by motion. The prompt now says so, so the model has no reason to pad.

**Accepted consequence:** a line under about 62 Burmese characters can only fund
ONE clip, so many beats are a single clip held up to `MAX_CONTINUOUS_SOURCE_S`.
That is within the rule and was accepted knowingly. **If more visual variety is
wanted, the lever is `MIN_SHOT_S`, not the narration** — lowering it lets a short
line carry more cuts. Do not reach for the prompt for this.

**Unchanged and still correct:** "the line's length decides how long its beat
stays on screen, so a rambling line makes the video drag." That couples length to
PACING, which is real, rather than to clip count.

## 2026-09-17 — A third of a second skipped is not a cut: continuity threshold 0.15s -> 0.5s

**Measured on a real export** (23.53s, 12 shots, 7 beats), three pairs played
near-adjacent footage back to back:

| pair | skipped | on screen together |
|------|---------|--------------------|
| 3.1 -> 3.2 | 0.47s | 3.54s |
| 4.1 -> 4.2 | 0.29s | 3.54s |
| 4.2 -> 5.1 | 0.42s | 3.41s |

Each PASSED the rule: `CONTINUITY_EPSILON_S` was 0.15s, so any gap above that
counted as a genuine cut. But skipping a third of a second inside the same scene
and carrying on does not read as a cut, it reads as one clip — and each of these
ran ~3.5s, over the 3.0s limit the rule exists to enforce.

**Decision:** `CONTINUITY_EPSILON_S` 0.15 -> **0.5**. The old value only ever
covered the 2dp rounding of scene boundaries; it was never chosen against how a
skip actually looks.

**`MIN_JUMP_S` 0.5 -> 0.75 comes with it, and has to.** It is the gap the
planner opens when it breaks a pair, so it must sit ABOVE the threshold that
decides whether a pair is joined — at 0.5 and 0.5, a freshly separated pair
lands exactly on the boundary it was trying to clear and the fix does nothing.
Keep that ordering if either value is tuned again.

**Cost:** sub-splitting a scene needs `k * slot + (k - 1) * 0.75`, so a scene has
to be slightly longer to be split. Borrowing also skips more spares as
"touching". Both are the intended trade.

## 2026-09-17 — Bug fixed: the fill test ignored playback speed

**Same export, 0.24s of held frames across two shots** — the class of bug
supposedly closed earlier the same day:

```
2.1: slot 2.92s needs 3.04s of footage at 1.04x, scene has 2.93s -> held 0.10s
7.1: slot 2.96s needs 3.17s of footage at 1.07x, scene has 3.03s -> held 0.13s
```

Off by exactly the speed multiplier. The "can this scene fill the slot?" guard
compared the scene against `slotS`, but the copyright-free transform plays
`slot * speed` seconds of source — up to 7% more. `footageFor()` now applies the
FASTEST speed the beat could be given, since which shot index gets which speed is
not known while scenes are being chosen.

**What this does NOT fix, deliberately:** the guard only runs while BORROWING. In
both shots above the beat had one scene and needed one shot, so nothing was
borrowed and the model's own too-short scene was used as-is. Closing that would
mean swapping out a scene the narration model chose to save about three frames of
held picture. Offered and declined.

## 2026-09-17 — The aspect ratio IS the format: pacing is per-ratio, not global

**Decision, the user's:** 9:16 goes to TikTok and Facebook, 16:9 goes to
YouTube, and **the aspect ratio alone selects between them.** No `format`
column, no migration, no wizard field. Both formats matter equally — this is not
a short-form product with a long-form mode, or the reverse.

`MOVIE_RECAP_PACING` in `lib/constants/movie-recap.ts` keys the shot band, the
continuity limit, the narration line budget, the beat cap and the subtitle
offset on the ratio:

| | 9:16 short | 16:9 long |
| --- | --- | --- |
| `minShotS` | 1.5 | 2 |
| `shotTargetS` | 2 | 3.5 |
| `maxShotS` | 2.4 | 4 |
| `maxContinuousSourceS` | 3 | 4 |
| `lineChars` | 25-45 (max 50) | 45-80 (max 90) |
| `maxSegmentS` | 3.5 | 6 |
| `subtitleOffsetPct` | 18 | 8 |

**Why the ratio and not a separate field:** a separate `format` column would
always move with the ratio, so it would be a second source of truth for one
decision. Considered and rejected by the user. The cost is recorded below.

**The four shot numbers stopped being module constants.** They arrive on
`planBeat` as `pacing`, so `lib/movie-recap-shots.ts` has no opinion about which
video it is planning. `shotsNeededFor`, `minShotsFor` and `breakContinuity` take
it too.

**THE INVARIANT any future profile must satisfy:** `floor(t / minShotS) >=
ceil(t / maxContinuousSourceS)`. It holds at 1.5/3 and at 2/4. It does NOT hold
at 2/3 — a 3.5s beat asks for 2 cuts and can afford 1 — which is why the
continuity limit moved to 4 in the same change rather than separately.
`movie-recap-shots.test.ts` now asserts this over every entry in the table, and
runs the 540-case continuity grid against both.

**`minShotS` is the split threshold, and it is the number that sets the feel of
the whole video.** `floor(t / 2)` is 1 until the beat reaches 4s, so a normal
16:9 line plays as ONE clip and only a long one is cut. `shotTargetS` only
decides how a beat already past that point is divided.

**Rejected: 3-4s shots on the old 1.5s floor.** Proposed first; the arithmetic
kills it. `floor(3.0 / 3.0)` = 1 makes EVERY beat one clip, so cutting inside a
line disappears and the narration prompt's 2-4 scenes per beat all fall through
to the spare pool unused. `minShotS = 2` is what makes a 3-4s target reachable
without that collapse.

**Longer 16:9 lines are not the old per-clip coupling coming back.** The prompt
used to quote shot lengths at the model, which was removed on purpose
(2026-09-16). `lineChars` bounds the IDEA, not the clip; the planner still fits
whatever the line turns out to be. But a 45-character line cannot hold a 4s clip
without the picture stalling, so the budget had to move with the band.

**Consequences a future reader will mistake for bugs:**

- **The 16:9 numbers are reasoned, not measured.** The 9:16 ones came out of real
  exports and four tuning passes; the 16:9 ones were derived from the arithmetic
  above and have never been rendered at length. Treat them as a first draft.
- **The 3.0s limit was recorded as non-negotiable and user-stated.** It still is
  — for 9:16. The user raised it to 4.0s for 16:9 only.
- **A 16:9 recap cannot be made to cut fast, and a 9:16 one cannot be made to
  hold**, without changing its frame shape. That is the accepted cost of keying
  on the ratio.
- **`subtitleOffsetPct` is seeded once, at project creation**, next to the
  framing. Changing the ratio later does NOT move a caption the user has since
  placed themselves — same rule the framing already follows.
- **18% for 9:16 is a starting guess, not a measurement.** TikTok and Facebook
  draw the post caption, the username and the audio ticker over the bottom of
  the frame, and at the old flat 8% the burned subtitle lands behind their UI.
  The number still needs eyeballing against a real post. The right-hand action
  column (`marginH`, a flat 6% both sides) has the same problem and is NOT
  addressed yet.

**Deferred, to be judged on a test render:** action/reaction shots at 2-3s
against 3-4s for normal ones. The motion track it needs already exists and
already places shots inside a scene; what is missing is the threshold that calls
a scene "action", and that is a number to pick by eye on a real export. Slow
zoom on a held frame is deferred with it.

## 2026-09-17 — Borrowing answers coverage, not just cut count

**The bug the per-ratio bands exposed:** every rule in `planBeat` sized a beat by
how many CUTS it needed. Nothing asked whether there was footage behind them. A
beat holding one scene shorter than its slot satisfies `minShotsFor`,
`shotsNeededFor` and `minShotS` alike at one shot, and arrives at the render
short — which the render answers with a held frame, while the spare pool sits
there untouched. Rare at 1.5-2.5s slots, because scenes are at least
`MIN_SCENE_S` (2s) and almost always filled them. Common at 2-4s slots.

**Decision: a second borrowing pass, driven by the freeze.** While the plan would
still hold a frame and the beat can afford another cut without falling under
`minShotS`, borrow another scene. Each extra shot shrinks the slot AND adds
footage, so the deficit falls from both ends. This can push the count past
`shotTargetS`'s `wanted` — deliberately: a cut the viewer did not expect beats a
picture that stops moving.

**`holdDeficit()` is what it measures, and it is not the padding warning.** It
counts only what the render would FREEZE, mirroring the four ffmpeg branches:
inside the speed-ramp band the render slows the clip, the scene still plays
whole, and there is nothing to buy a cut for. The `warning` below it still
reports the whole gap including the ramped part. Different questions — one
decides whether to spend a cut, the other tells a human the beat is thin.

**Sub-splitting cannot serve coverage, and the arithmetic is why:** splitting one
2.2s scene into two windows halves the slot too, so the deficit is identical
either way. It adds cuts, never footage. It stays where it was, serving the
continuity invariant only. This was checked rather than assumed — "prefer
sub-splitting over freezing" sounds right and does nothing.

**What is left, and is not a bug:** a beat under `minShotS * 2` cannot be split
at all, so a short scene under a short line still freezes and there is no cut to
buy. Borrowing cannot help a beat that cannot afford a second shot. The order is
therefore borrow (real footage) -> slow-fill (small gaps, inside the ramp band)
-> freeze (last resort), with sub-split outside that chain.

**`SPEED_RAMP_MAX` stays 1.15.** Raising it to 1.25 was proposed, to convert more
freezes into slow-fill, and declined by the user: 1.25 is ~0.8x playback, which
reads as deliberate slow motion rather than as nothing in particular. Slow-fill
is for small timing gaps only.

## 2026-09-17 — The copyright speed set is slow-only: [0.95, 0.96, 0.97] (supersedes)

**Decision:** `MOVIE_RECAP_COPYRIGHT_TRANSFORM.speeds` no longer speeds any shot
up. Was `[0.96, 0.97, 1.04, 1.07]`.

**Why:** a shot running fast fights the slower pacing, and speed decides how much
source a shot consumes (`slot * speed`), so a slow-only set runs LESS far into
the footage after each shot — which gives the continuity invariant more room
rather than less.

**Why not 0.94, which was proposed:** it is the one value in the old set that
reads as deliberate slow motion rather than as nothing in particular (recorded
when the set was narrowed earlier today). In a mixed set of four it was an
outlier; in a slow-only set of three it would land on a third of the shots.

**Rejected, and this is the one worth keeping: "slow a shot only if it needs
it".** That is DERIVED speed, which is exactly the design the 2026-09-16
inversion replaced, and for exactly the recorded reason — the trim and
freeze-pad branches both play at 1.0, so deriving leaves most shots at the
source's own speed and the transform stops contributing to de-fingerprinting.

What the request was after already exists and is a different mechanism: the
speed **ramp**, which slows a clip to fill its slot when the gap is small
(`SPEED_RAMP_MIN/MAX`, 0.85-1.15). The two are named apart now to stop them
being merged again — **fill-speed** is derived and fills a gap; **transform-speed**
is an input and de-fingerprints. A ramped shot is not playing at 1.0 either, so
"no shot ever plays at the source's own speed" survives both.

## 2026-09-17 — Three frames per scene on 9:16, so the vision pass can describe an EVENT (the 9:16-ONLY half is SUPERSEDED 2026-09-19 — three frames on both ratios now; the reasoning for three stands)

**The limit, and it was never the prompt:** `extractKeyframes` took ONE still per
scene and the vision prompt asked for one sentence about it. A single frame
cannot show an event. "Two men argue across a table" is a frame; "he draws and
she runs for the door" is a change over time, and a fast-cut recap is mostly made
of the second kind. Wording the prompt harder could only ever get a richer
description of one moment.

**Decision:** `keyframesPerScene` joins MOVIE_RECAP_PACING — **3 on 9:16, 1 on
16:9**. The model is shown a scene's frames in order and asked what CHANGES
across them, not to describe each one.

**9:16 only is the user's call, not a technical boundary.** Nothing about
describing an event properly is format-specific; if it proves out on a reel it
should come to 16:9 too. Recorded so the asymmetry is not later mistaken for a
reasoned one.

**Cost is not tokens.** Frames go at `detail: "low"`, ~19 prompt tokens each, so
300 scenes x 3 is ~17k tokens. What it actually costs is ffmpeg extraction time
(three seeks per scene instead of one) and request size — `VISION_BATCH` is
counted in SCENES now (8) rather than frames (25), which keeps ~24 images per
request exactly as before.

**The coupling this would have broken, and what was done about it:** a shot plays
the moment its scene was DESCRIBED from (2026-09-17) — `focusWindow` anchors on
`KEYFRAME_FRACTION`, a fixed third. That constant only means anything while
there is exactly one frame. With three, there is no single described moment and
the anchor would have been silently wrong for every 9:16 shot.

So the model now returns **`peakFrame`** alongside the sentence: which frame
carries the thing it described. That becomes the scene's `keyframeFraction`,
which rides on `SourceWindow` through the planner into `focusWindow`. This is
strictly better than the old fixed third even at one frame, because the moment
is chosen rather than assumed — the "main part is cut out" bug that produced the
original rule came from exactly that assumption.

**Fallbacks, both deliberate:**

- A window the planner INVENTED — a sub-split piece, a separated pair — has no
  described moment and falls back to `KEYFRAME_FRACTION`. It is not a scene the
  vision pass ever saw, so there is nothing better to use.
- An out-of-range `peakFrame` falls back to the MIDDLE frame, not the last. It
  means the model lost count, not that it meant the end — the same reasoning as
  the out-of-range scene indexes in the narration pass, which are dropped rather
  than clamped.

**`SINGLE_KEYFRAME_FRACTION` is exported and tested at exactly 1/3.** The even
spread used for several frames is `(i + 0.5) / count`, which would give 0.5 for
one — tidier, and wrong. One frame keeps the third, because that value is
recorded, load-bearing and unchanged for 16:9. The test exists to stop the
tidying.

**Unchanged, and still for their original reasons:** no names, no mood, no
guessing at off-screen events. The narration model is the one that interprets; a
vision pass that speculates feeds it invented plot.

## 2026-09-18 — Longer 9:16 lines, and captions are cut with the picture

**Reported by the user, off a real render:**
"အဘွားကိုအလုပ်ခေါ်လာတဲ့ကောင်မလေးက အခြေနေကိုရှင်းပြရတယ်တဲ့" — awkward. Diagnosed
first as grammar (hearsay တဲ့, obligation ရ, a stacked pre-modifier) and
corrected by the user: **the problem is over-compression, not grammar.**

**Decision 1: 9:16 `lineChars` 25-45 (max 50) -> 40-70 (max 80).** At 40
characters a line has to carry who someone is, what they did and what they are
doing now, and the only way to fit that in Burmese is to stack it all into one
clause before the verb. That IS the awkward phrasing — it is what the budget
forces, so no amount of register wording fixes it.

**It costs nothing in pacing, which is why this is cheap on 9:16 specifically.**
A longer beat buys MORE cuts there, because `minShotS` is 1.5: a 45-character
line is ~3.5s and 2 shots, a 70-character one is ~5.5s and 3. The video gets
longer overall, which the user has said does not matter — a reel that runs long
is trimmed by hand.

**No grammar bans were added.** They were drafted (no sentence-final တဲ့, no ရ
obligation) and dropped once the cause turned out to be the budget. The
2026-09-16 decision — role framing instead of a grammar checklist — stands
untouched, and re-adding bans would have "fixed" a symptom while leaving the
line still trying to say three things in forty characters.

**Decision 2: one caption cue per SHOT.** The chunks that size a beat are split
on readability (`MAX_CUE_CHARS`) and their boundaries have nothing to do with
where the picture cuts, so one caption could sit across two or three shots. At
40-character lines that was survivable; at 70 it reads as a wall of text parked
over a sequence of cuts.

After planning, the line is re-divided into as many balanced pieces as the beat
has shots (`splitIntoNChunks`) and each cue is held for exactly its shot.
`spreadCuesOverShots` handles the case where it cannot divide that finely —
Burmese is written with spaces between phrases rather than every word, so a
short line can be one indivisible token. The extra shots go to the LONGEST
pieces, so a two-word chunk is never left up across three cuts.

**Beat length is still sized by the readability chunks, before planning.** That
is deliberate and not a leftover: subtitles decide the beat's length
(2026-09-15), and re-chunking after the fact must not feed back into it or the
two would chase each other.

**Consequence:** a cue's duration is now its shot's slot rather than its own
reading time. Slots within a beat are equal and the pieces are balanced by
length, so these are close — but a cue is no longer individually checked against
`MAX_CUE_CHARS_PER_SECOND`. The beat as a whole still is, upstream.

**Bug found and fixed on the way: the caption timeline drifted earlier by
`BEAT_GAP_S` every beat.** `cursor` advanced by the sum of the cue durations
(`timed.segmentS * stretch`), while the video advanced by `slotS * shotCount`,
which is `targetS` — and `targetS` includes the 0.15s breath between beats. So
every beat started its captions 0.15s before its picture, cumulatively: ~4.5s
out by beat 30 of a real render. The new path advances `cursor` by exactly
`slotS * shotCount`, so it cannot drift by construction. Mock renders were never
affected — `gapS` is 0 there.

## 2026-09-18 — 9:16 renders at 1080×1920; 16:9 stays at 720p

**Decision:** `MOVIE_RECAP_TARGET_DIMENSIONS["9:16"]` is `[1080, 1920]`, was
`[720, 1280]`. 16:9 is untouched at `[1280, 720]`.

**Why now, and only for 9:16:** the user moved from test-rendering reels to
publishing them. TikTok, Facebook and Reels all re-encode whatever they are
given, so a 720-wide source means their compression starts from an already-soft
picture. It shows worst on the burned Burmese captions — the caption-size entry
already recorded 720p as below the comfortable floor for Burmese, with stacked
marks closing into the letter and the outline doing most of the separating. 16:9
has still never been rendered at length and is a draft config; raise it when it
is actually being published.

**Cost is encode time, ~2.25x the pixels. Nothing else had to change** — every
size in the pipeline is a percentage of the frame (caption size, logo box and
margin, blur REGION geometry, subtitle offset), so they all scale by
construction.

**Except the two blur RADII, which are pixels, and this is the part worth
reading.** `MOVIE_RECAP_BLUR.radius` (region blur) and
`backfillBlurRadius` (letterbox fill) are absolute `boxblur` values. A fixed
radius blurs relatively LESS on a bigger frame, so a region blur that hid a
watermark at 720 would stop hiding it at 1080. That is a correctness bug, not a
cosmetic one, which is why they now scale with the output width.

**`BLUR_REFERENCE_WIDTH` is PER RATIO — 1280 for 16:9, 720 for 9:16 — and the
first attempt got this wrong.** A single shared reference of 720 was written
first; it scaled the 16:9 backfill from 20 to 36 as a side effect, silently
changing a ratio this change was supposed to leave alone. The transform test
caught it. Anchoring each ratio to the width its own radius was tuned at is what
keeps 16:9 byte-identical while 9:16 moves by 1.5x (20 -> 30, 12 -> 18).

**The preview converts from the RENDER's radius, not the reference one.**
`movieRecapBlurCssPx` takes the aspect ratio rather than a width now, and calls
the same scaling function the render does — otherwise the CSS preview and the
burned output drift apart the next time a resolution moves.

## 2026-09-18 — The last words were being cut off: frame rounding, then `-shortest`

**Bug:** a finished recap ended one or two words early. Everything up to the
final clip was fine; the picture ran out while the voice-over was still talking.

**Cause, in two parts.** Each shot is cut with `-t slot` and then resampled to
`MOVIE_RECAP_TARGET_FPS`, so what comes out is a whole number of frames — up to
33ms short of its slot, always short, never long. The narration track is padded
to `beatDurations`, which are those same slots as exact floats. So the audio was
genuinely longer than the picture, by roughly a frame per shot: about a second
over sixty shots. The final mux then passed `-shortest`, which resolved that
mismatch by truncating the audio. The last beat deliberately gets no
`BEAT_GAP_S` (a recap should not end on dead air — 2026-09-16), so it had no
slack to absorb the loss and the cut landed on its closing words.

**Fix, also two parts.**

- `slotS` is rounded onto the frame grid before anything uses it. The cut, the
  caption cues and the narration padding all read that one number, so the three
  stay on a single timeline instead of drifting apart. This is the part that
  matters: without it the captions drifted off the cuts by the same amount, in
  the same direction, whether or not the tail was fixed.
- The final pass probes the concatenated picture and the narration track and
  holds the last frame for the difference (`tpad` at the head of the overlay
  chain, so the held frame gets the same blur and logo). `-shortest` then trims
  that pad back off at the last spoken sample.

**Why the pad stays even with the rounding fix.** The rounding is what ffmpeg
*should* do with an on-grid `-t`, not a guarantee; a boundary frame either way
would put us back to silently truncating speech. The pad costs one ffprobe of a
local file and makes "the audio is never cut" true by construction rather than
by arithmetic.

**Consequence worth knowing:** the output is now exactly as long as the
narration, not as long as the sum of the beats. A render log line reports the
gap it covered — a large one there means the segment cutting has drifted for
some other reason and is worth chasing.

## 2026-09-18 — An edited script can be re-rendered without re-reading the source

**Problem:** the only way to fix one awkward narration line was to render the
whole project again — and a full render calls the script model again, so it came
back with a *different* script. The lines that were fine were rerolled along
with the one that was not. `render_script` was already written to the row, but
nothing ever read it back: no route, no UI.

**Decision: the script is the editable artefact of a render.** Step 4 lists the
beats, each line editable, with "Re-render this script". A re-render skips scene
detection, the vision pass, subtitle-reading/Whisper and the script model, and
runs TTS and ffmpeg on the words as written.

**Only the TEXT is editable.** The shot list under a beat is the planner's
output, timed against the source, and the browser has no way to judge it. PATCH
takes the text and keeps the stored shots, and rejects a script with a different
number of beats — dropping a beat would strand its footage with nothing to say
over it. Like `hookTitle`, this does not set `changesConfiguration`: re-rendering
the script is the point, not a reason to demote an approved project to draft.

**The analysis goes to R2, not a column.** The planner needs three things the
script does not carry: the spare scenes it may borrow from, the source's own
cuts, and the motion track. The motion track alone is one value per 0.25s of
source — hundreds of kilobytes for a feature — and the project row is re-read
every two seconds while a render runs, so a jsonb column would ride along on
every poll. The row stores `render_analysis_key`; values are rounded to two
decimals, which is far past what the planner can act on and roughly halves it.

**Written before the cut, not after.** The analysis and the script both land on
the row as soon as the script exists. A render that dies while cutting has
already paid for the vision pass and the script model; losing the words it
bought would mean buying them twice.

**Rejected: caching the transcript and scene descriptions too.** Nothing
downstream of the script reads them — they exist to write the script, and a
re-render does not write one. Storing them would be for a per-beat re-roll,
which is not built. Revisit when it is.

**Consequence:** a re-render still downloads the source (ffmpeg cuts every shot
from it) and still pays for TTS (the words changed). It is not free, just free
of the analysis. A missing or unreadable analysis blob fails the re-render with
"render again from the source" rather than planning against nothing.

**Deferred (2026-09-18): rebuilding a missing analysis from detection alone.**
Projects rendered before this existed have no analysis, so their stored script
cannot be re-rendered until one full render runs — which writes a new script and
discards the wording the user may have wanted to keep. A re-render could instead
re-run scene detection only (cuts and motion come straight from it, and spares
are the detected scenes no beat overlaps), costing one detection pass and no AI.
Not built: it only helps projects that predate the feature, and those spares
would carry no `keyframeFraction`, so borrowed footage would fall back to the
fixed one-third cut point. Build it if pre-existing projects turn out to matter.

## 2026-09-18 — Hook titles removed entirely

**Decision (user, overriding the 2026-09-17 entry above): hook titles are gone
— prompt, model call, render stage, columns and UI.** They were not useful in
practice. Nothing downstream consumed them: they were five strings shown in the
Review tab and copied out by hand, which is work the user was already doing
somewhere else with better context than the narration alone gives.

**What survives from the superseded entry:** the thumbnail removal. The
source-frame thumbnail is still gone and is not coming back — hook titles were
its replacement, not its justification.

**Columns dropped, not orphaned.** `hook_titles` and `hook_title` are gone from
the schema. Keeping them would have left two columns nothing writes and nothing
reads, and the only data in them was regenerable by rendering — which the render
no longer does.

**Consequence:** the `writing_hook_titles` render stage is gone with them, so
the Publish step of the progress stepper is now `uploading` alone, and a render
ends at the upload. One fewer GPT call per render.

## 2026-09-18 — The "Generate Recap Video" button is removed

**Decision:** it is gone, with its `ready_for_generation` toast. Phase two
shipped: the render buttons below it do the work, and a button promising a video
that only flipped a status column was a lie the UI told on every visit.

Its one visible effect was the green "Ready" badge on the project list card.
That badge now reads `renderStatus === "done"` and says "Rendered" — a project is
worth flagging when it has a video, not when its settings were approved by a
button nothing downstream consults.

**Kept:** the `status` column, its PATCH validation, and the `changesConfiguration`
demotion. Nothing sets `ready_for_generation` any more, so the demotion is inert,
but dropping a column is not undoable and this one costs nothing to leave. Drop
it if a later change needs the space.

## 2026-09-18 — "Render AI Preview" asks before it spends

**Decision:** the full render is behind a `ConfirmDialog`. It is the one button
here that both costs real money (vision pass, transcription, the script model,
TTS) and destroys work: it writes a NEW narration script over `render_script`,
so any hand edits go with it, and it replaces the output video.

The wording changes with the project: a first render is described as cost and
time, a re-render leads with what it overwrites.

"Re-render this script" confirms too, for the two things that are not obvious
from the button: TTS is re-synthesized for every beat, not just the edited ones,
and the current video is replaced. The mock stays unconfirmed — it spends
nothing.

**Trap:** both handlers are written `() => { run(); }` rather than `run`, which
looks like pointless indirection and is not. GeckoUI keeps the dialog open with
a loading button for as long as `onConfirm` returns a promise, and the render
request stays open for the whole pipeline — that would put a modal over the
progress bar for minutes. The render button does its own loading state, so the
dialog closes the moment it is confirmed.

## 2026-09-18 — The customize preview's controls move outside the picture

**Superseded:** the note that the native control bar was hidden because it sits
along the bottom of the frame, exactly where the subtitle renders, leaving a
corner play/pause badge as all a design preview needs. The badge had the same
problem in miniature — it was chrome drawn over the thing being designed — and a
design preview does need to reach a specific moment in the source, which
play/pause alone cannot do.

**Decision:** the frame holds the picture and the design layers only — video,
subtitle sample, logo, blur rectangle. Play/pause, a seek slider and a time
readout sit in a row underneath it, inside the same bordered box. The frame is
wrapped in a shrink-to-fit column so the control row is exactly as wide as the
frame: narrow under 9:16, 620px under 16:9.

**Rejected: a player library** (Plyr, Video.js, Vidstack). They wrap the video in
a container they own and draw their chrome inside it, which is the one place
nothing may be drawn here — and the CSS transform and filter that mirror the
ffmpeg chain have to stay on the video element itself, under three overlay
layers. Stripping their UI and pulling the scrubber out of their container is
more work than the state this needs. `media-chrome` is the one that would fit if
richer playback is ever wanted, since its parts can be composed outside the
picture; the finished-render player in step 4 is where it would earn its keep.

**Trap:** `timeupdate` fights the slider while it is being dragged. A ref
suppresses the update between pointer down and pointer up, so the thumb follows
the pointer rather than snapping back to where playback has reached.

## 2026-09-18 — The source preview waits for the upload to finish

**Decision:** step 1 plays the video only when `sourceUploadStatus` is `ready`.
While an upload is running, or after one that did not finish, the panel shows the
filename and says why there is nothing to play.

**Why:** it used to play the local blob the moment a file was chosen, which reads
as "done" while a multi-gigabyte multipart upload is still climbing. The progress
bar underneath said otherwise, and the picture won.

**The blob is still what plays.** It is preferred over the R2 URL once the upload
is ready, so the preview is instant and costs no download. Only the moment it
appears changed.

**Consequence:** reopening a project whose upload was interrupted shows the
placeholder rather than a player, next to the existing "Reselect the same local
file to continue this upload" prompt. That is the honest state — R2 holds parts,
not a playable object.

**Bug fixed with it (2026-09-18):** step 3 showed a black frame until the page
was reloaded. `MovieRecapSource` revoked the local blob URL on its own unmount,
which is exactly when step 1 is left — so the URL it had just handed up to the
wizard was dead before step 3 rendered it. A reload cleared the wizard's copy,
fell back to the R2 URL, and the picture came back, which is what made it look
like a loading problem rather than a lifetime one. The wizard owns the URL now
and revokes it when it is replaced or when the wizard itself unmounts.

## 2026-09-18 — Deleting a project deletes everything under its prefix

**Bug:** deleting a project removed the source object and the logo, and left
everything the renders had written. The finished video, its subtitles, the
analysis blob, and — worse — every SUPERSEDED render output, since each render
writes a new UUID key and only re-points the row. A project rendered ten times
left ten videos in the bucket, nine of them already unreachable before the
delete.

**Cause:** the cleanup deleted the keys the ROW holds. Most of a project's
objects are not in any column.

**Fix:** delete by prefix. Every object a project can own lives under
`movie-recaps/<id>/`, so `deletePrefix()` lists and removes the lot, paginated,
and cannot miss a kind of object added later — a new `kind` in
`movieRecapObjectKey` is cleaned up without touching this code.

**Order is unchanged and deliberate:** storage first, row second. A storage
failure returns 502 with the row intact, so the project can be deleted again.
The reverse would drop the row and strand the files with nothing left pointing
at them.

**Not fixed here:** a render still leaves its predecessor in the bucket while the
project lives. Deleting the old output on each successful render is the obvious
follow-up and is the real cost driver now that re-rendering from an edited
script is cheap.

## 2026-09-19 — The transcript is a wizard step, read once, before anything else (the line-for-line translation in this entry is SUPERSEDED the same day — see below)

**Decision:** a **Transcript** step sits between Add Source and Project Settings,
so the wizard is five steps (`?step=transcript`). It reads the source's dialogue
— the file's own subtitle track when it has a usable one, Whisper otherwise —
and then translates every line into Burmese. Both readings are stored on the
project row (`transcript`, `transcript_mm`, `transcript_source`) and shown side
by side, one row per line, with the line's timestamp.

**The render no longer reads the source for dialogue.** It uses the stored
transcript when there is one and falls back to reading the source only for
projects that predate this step or whose transcript run failed. Two readings of
the same film would disagree — Whisper is not deterministic — and the user would
have approved words the render never used.

**This supersedes "Rejected: caching the transcript and scene descriptions too"
(2026-09-18).** That entry rejected storing the transcript because *nothing
downstream read it*, and said to revisit when something did. The transcript step
is that something: it is shown, and the render consumes it.

**Translation is display-only.** The narration model still receives the
original-language dialogue through `dialogueForScene`. It already writes Burmese
from whatever it is given, and translating twice — once here, once implicitly in
the narration prompt — would put a second lossy hop in front of the script for no
gain. The Burmese column exists so a user who does not read the source language
can judge whether the recap is about to be written from the right material.

**Translation is batched and strictly one line in, one line out**
(~6000 characters or 60 lines per request). A feature's transcript is thousands
of lines. The one-to-one rule is not politeness to the model: the two columns are
read as rows, so a model that merges or splits lines puts every Burmese line
under someone else's timestamp. A batch that comes back the wrong length is
padded from the original, which reads as untranslated rather than misaligned.

**Continue is blocked until the transcript exists.** Everything after this step
is configuration for a render that now depends on it; letting a user past would
mean the render silently falling back to reading the source itself.

**Consequence: existing projects shift a step.** The migration bumps every
`current_step >= 2` by one and widens the check to 1-5. Their `transcript` is
null, so their Review step still renders — the render's fallback path is what
keeps them working, and it is not dead code.

**Also in this change:** `transcribeSource()` and the captions-or-Whisper choice
moved out of `lib/movie-recap-render.ts` into `lib/movie-recap-transcript.ts`
(`readSourceTranscript`), and `FFMPEG`/`run()` into `lib/movie-recap-ffmpeg.ts`,
so the render and the transcript step share them without a cycle.

## 2026-09-19 — The Burmese side is a retelling, not a translation (supersedes)

**Decision, made by the user against the entry above:** the Transcript step's
Burmese output is **one flowing story**, produced by a storyteller prompt that is
explicitly told to avoid literal translation and to sound like a story told
person-to-person. The source transcript is displayed first — timed, line by line,
the record of what was said — and the Burmese story sits under it as prose.

**This supersedes "Translation is batched and strictly one line in, one line
out"** from the entry above, and the two-column aligned table it existed to
protect. The reasoning there was not wrong: a retelling cannot be aligned to
source lines, and that alignment is now gone. It is deferred, not denied — the
plan is to break the story back down into lines later, from the story rather than
from the source.

**Consequence: nothing downstream reads the Burmese story.** The narration model
still receives the original-language dialogue through `dialogueForScene`. Until
the breakdown exists, the story is for the user to read.

**Retold in passages, and they are not stitched.** A feature's dialogue is far
past one call, so it is chunked at ~12,000 characters and each chunk retold
(`retellInBurmese`), the results joined with a blank line. Each passage is its own
narrative with its own opening — the seams are visible, and that is accepted for
now. A chunk small enough to align neatly would have nothing to narrate, which is
the whole reason the chunk is large.

**`transcript_mm` (jsonb) was dropped for `transcript_story` (text).** Same-day
column, no data worth migrating, and the name now says what it holds.

**Update, same day: the retelling runs on `gpt-5.6-sol`,** not the `gpt-5.6-luna`
every other pass here uses. It is the only pass whose output a person reads as
prose — it is judged on how the Burmese sounds, not on filling a schema.

**Update, same day: the retelling is streamed, for the bar's sake.** Counting
whole passages left the bar at 0% for minutes — a long source is only two or
three passages, so nothing moved until one finished, and the run looked hung.
`retellInBurmese` now streams and reports characters written; the pipeline turns
that into `transcript_progress_partial` (0-100 through the passage in flight),
written at most every 1.5s because the browser polls every 2s. The estimate
divides by the INPUT length, which over-estimates — the retelling is condensed
and Burmese runs shorter — and is capped at 95%: a bar sitting at 95% is honest,
one that reaches 100% and keeps working is not. The stream is for progress only;
the text is still used whole when the passage ends.

**Update, same day: the transcript run has a stepper,** the render's one
generalized (`stepStates` in `lib/movie-recap.ts`, now shared by both). Source /
Dialogue / Burmese story. A **percentage bar appears only under the retelling**,
because that is the one stage that can count itself — it knows how many passages
are left. No percentage is invented for the download or the transcription: a bar
that fakes its own progress is worse than no bar. A retell-only run shows the
first two steps struck through, which is why `transcript_story_only` is a column
rather than something derived after the fact — once the run is over, nothing in
the row would say those steps had been skipped rather than done.

**Update, same day: "Retell" rerolls the story alone** (`POST
movie-recaps/:id/transcript` with `storyOnly`). It runs on the transcript already
on the row: no download, no second Whisper bill. Without it the only way to
reject the wording was re-reading the whole film, which is the same trap the
script's "re-render from the saved script" was built to escape.

## 2026-09-19 — Deleting the video at step 1 deletes the project

**Decision:** the Add Source step has a "Delete video" button, and it deletes the
whole project (`DELETE movie-recaps/:id`) and returns to the project list.

**Why not remove just the source:** at this step the project IS the source. Its
name, aspect ratio, fit mode and subtitle offset were all seeded from the file,
its R2 object key is built from the filename, and the transcript and every render
hang off it. Clearing only the source would invent a state nothing else handles —
a project row whose `source_upload_status` says nothing usable is there — and
would leave a transcript and a rendered video describing a file that is gone.

**Rejected: swapping in a different file in place.** It reads as the obvious
feature and is a trap: the object key would have to be rewritten, and every
derived artefact (transcript, story, script, analysis, render output) silently
becomes about the wrong film. Build it only with an explicit reset of all of
those, and a confirmation that says so.

**Consequence:** deleting removes the uploaded source and logo with the project,
so there is no undo. The confirm dialog names the file and says as much.

## 2026-09-19 — The Transcript step takes both texts by hand (AI read parked)

**Decision, by the user:** the Transcript step is two textareas — the source
transcript and the Burmese story — saved on the project row
(`transcript_text`, `transcript_story`). Nothing calls a model.

**Parked, not deleted.** `POST movie-recaps/:id/transcript`, its cancel route,
`runMovieRecapTranscript`, `retellTranscript` and
`MovieRecapTranscriptProgress.tsx` all still exist and still work; the wizard
simply stopped calling them. Turning the automatic read back on is a change to
one step's component, not a rebuild. `readSourceTranscript` is NOT parked — the
render still calls it, which is what keeps the render working now that nothing
fills `transcript` up front.

**Pasted text has no timestamps,** so it could not go in `transcript` (the timed
`{start, end, text}[]` the read pipeline produces). Hence a separate
`transcript_text` column. `transcript` still holds whatever an earlier automatic
run left on a row; nothing displays it.

**Consequence: the render is back to reading the source itself.** With
`transcript` empty on new projects, the render's fallback path runs — subtitle
track or Whisper, as it did before the Transcript step existed. So the hand-typed
transcript is not what the recap is written from. It is stored for the line-level
breakdown that is coming, and for the user to read.

**Continue is gated on the source transcript being non-empty,** the same gate as
before, now on the typed text instead of the read one.

## 2026-09-19 — The render cuts the typed Burmese story at its own timestamps

**Decision, by the user:** the hand-typed Burmese story IS the narration script,
and its timestamps are positions in the SOURCE — the uploaded video is the very
one they were read off. So a block's footage is simply the source between that
block's time and the next one. Nothing has to be matched to anything.

**What a full render now runs:** download, TTS, ffmpeg. That is all. Scene
detection, the vision pass, subtitle-reading/Whisper and the narration model are
each skipped — not conditionally, but because nothing calls them.

**Parked, not deleted, at the user's instruction.** `detectScenes`,
`describeScenes`, `extractKeyframes`, `generateMovieRecapNarration`,
`readSourceTranscript`, `runMovieRecapTranscript` and `dialogueForScene` all
still exist and still work (`dialogueForScene` is exported purely so it survives
being uncalled). Their stages stay in `MovieRecapRenderStage` and stay grouped in
`MOVIE_RECAP_RENDER_STEPS`, so the progress bar is correct again the day they
come back. On the bar they read as **skipped** — struck through — via
`MOVIE_RECAP_PARKED_STEPS`, rather than being dropped from it: a bar that
silently lost three steps hides that they are gone.

**One block is one beat.** A block is 23-30s of source carrying ~385 Burmese
characters, so the shot planner still does its job inside it — the continuity
limit, the speed set and the copyright transform all apply unchanged. Nothing
here bypasses the planner; it is handed one window per beat instead of a model's
scene picks.

**Blocks outside the source are dropped, not clamped** (`parseTimestampedBlocks`,
with tests). A stamp past the end describes footage that is not there, and a
zero-length window would put narration over nothing — which reads as a render bug
rather than as the bad paste it is. A stamp that goes backwards is dropped for
the same reason: one bad line must not drag the blocks after it out of order.

**Consequence: there are no spare scenes.** Without detection the planner has
nothing to borrow from, so a beat whose narration outruns its own footage holds
or slows rather than cutting away. The analysis blob is still written (empty) so
a re-render has something to load instead of failing on a missing object.

**Consequence: the English transcript is not read by anything.** It is stored for
the user and for the line-level breakdown still to come.

**Also: "Render AI Preview" is now "Render Preview",** and the confirm text no
longer promises passes that do not run. The only model left in a full render is
the TTS voice.

## 2026-09-19 — The keyframe count leaves the pacing table: how a scene is READ is not a format choice

**Decision, approved by the user:** `keyframesPerScene` is gone from
`MOVIE_RECAP_PACING` and is now `MOVIE_RECAP_KEYFRAMES_PER_SCENE = 3`, the same
for both aspect ratios. This supersedes the 9:16-only half of the 2026-09-17
entry, which had already recorded that asymmetry as the user's call rather than a
technical boundary, to be revisited.

**Why it mattered enough to fix while dead:** it was the one field in that table
that changed how the story is UNDERSTOOD rather than how it is presented. Every
other field — the shot band, the continuity limit, line length, caption timing
and offset — is a consequence of where the video is posted or of the frame's
shape. One frame per scene on 16:9 meant a landscape recap was built from a
weaker reading of the same film: the model saw a situation ("two men argue")
where the vertical one saw an event ("he draws and she runs"). An audit against
the rule "one recap logic, aspect ratio as a presentation profile" found nothing
else out of place.

**Fixed while nothing calls it,** because the vision pass is parked with the
other AI passes. That is the point: it is cheaper to correct now than to
rediscover the asymmetry the day the pass comes back, and the entry above shows
how easily an admitted-temporary asymmetry reads as reasoned later.

**Deliberately NOT changed: `fitMode`.** The crop is a user setting seeded once
from the source's orientation, not derived from the output ratio. A ratio alone
cannot decide it — `cover` is right for a portrait source in a 9:16 frame and
throws away most of a landscape one. Recorded because a format-profile table
looks like the obvious home for it.

## 2026-09-19 — The line budget leaves the pacing table too: one script, two formats

**Decision, by the user:** `lineChars` and `lineMaxChars` are gone from
`MOVIE_RECAP_PACING` and are now `MOVIE_RECAP_LINE_CHARS = [45, 80]` and
`MOVIE_RECAP_LINE_MAX_CHARS = 90`, the same for both aspect ratios. With the
keyframe count already moved (above), the pacing table is now presentation only:
the shot band, the continuity limit, caption timing and the subtitle offset.

**Why:** keyed on the ratio, the same film posted to TikTok and to YouTube came
back as two DIFFERENT SCRIPTS. A line fixed in one was still wrong in the other,
and the two could not be compared. Choosing an aspect ratio should decide how
many pieces the narration is cut into, never what it says.

**The 16:9 pair won.** 9:16 had 40-70 (max 80) against 16:9's 45-80 (max 90).
Widening 9:16 costs it nothing — a longer beat there buys MORE cuts, since
`minShotS` is 1.5, and 9:16's own budget had already been raised once for being
over-compressed. Narrowing 16:9 would have cost it real pacing: a 45-character
line cannot hold a 4s clip without the picture stalling.

**Rejected: making the line budget a project setting.** It would decouple the
same thing, and the user does not want the control — they are the only user and
one budget is enough. Revisit only if a second budget is ever actually wanted.

**`movieRecapNarrationSystemPrompt` is a plain string again,** not a function of
the pacing profile, and `generateMovieRecapNarration` no longer takes one. Both
are parked with the rest of the AI passes; fixed now for the same reason the
keyframe count was, rather than leaving the asymmetry to be rediscovered.

**What choosing an aspect ratio now does, in full:** how many pieces a beat is
cut into (9:16 cuts every 3s, 16:9 every 4s), the frame's shape and crop, the
output size (1080x1920 against 16:9's 720p, still a draft), where the subtitle
sits, and how long one caption may hold. Nothing else.

## 2026-09-19 — A held frame drifts instead of sitting dead

**Decision, by the user:** when a shot's slot outlasts its footage, the held
frame is no longer frozen — it pushes in slowly and slides, the way a
documentary treats a still. Nothing on screen stops.

**Why it matters more than it sounds:** the shortfall is not one hold at the end
of a beat. Every shot in a short beat runs out of footage, so the picture used to
move, stop, cut, move, stop, cut — a rhythmic stutter, which reads as a broken
render rather than as a slow one. On this project's opening blocks each shot was
~3.2s of motion followed by ~3.2s of nothing.

**Applied ONLY to shots that actually hold.** A shot with enough footage is
untouched. In the copyright-free path `tpad` also covers the single frame a speed
change leaves to rounding; that is deliberately NOT animated, or every shot in
the recap would drift for an invisible frame.

**Across the whole shot, not just the held part.** Starting the move at the
moment the footage runs out marks exactly where the freeze began. Drifting from
the first frame means the hold has no onset to see.

**Numbers, and why they are small.** 1.12 zoom by the end of the shot, and the
slide spends 0.6 of the room that zoom opens. Past ~1.2 it reads as a deliberate
zoom rather than as the picture being alive — the same line the rejected
slow-motion fill ran into. The drift fraction stays under 1 so the window can
never leave the frame, which is asserted rather than eyeballed.

**Direction is hashed, not random** (`pickHoldDrift`), for the reason the speed
set is: a re-render has to produce the same file. Neighbouring shots get
different directions, so a run of held shots does not read as one long camera
move across the cuts. The FNV-1a hash `pickShotSpeed` had inline is now shared.

**`zoompan` runs on a doubled frame.** It snaps its window to whole pixels, which
jitters at output size; doing it at 2x halves the step. Measured at 1080x1920 the
doubling costs nothing next to the encode (1.78s against 1.83s for a 5s clip).

**Timing is a parameter of `holdMotionFilter`, which the rest of
`movie-recap-transform.ts` refuses.** That rule is about steps which change a
shot's DURATION — a speed change or a freeze — because those must be planned, not
appended. This one is `slotS` in, `slotS` out; it needs the length only to finish
its move as the shot ends. Verified end to end against ffmpeg, not just as a
string: 5.000s, 150 frames, output size unchanged, and three frames sampled from
inside the hold all differ.

**This does NOT replace fixing the script.** The opening seven blocks still say
more than their footage can cover (75s over), and a drifting hold is a better
failure, not a success. The numbers are in the entry above.

## 2026-09-19 — The copyright-free toggle is gone; its look is just the look

**Decision, by the user:** `copyright_free` is removed. Everything it gated is
now unconditional — the blurred backfill behind letterbox bars, the zoom, the
mirror, and the colour grade — except the per-shot playback speed, which is
deleted outright. Zoom keeps its slider.

**This supersedes the whole copyright-mode line of entries** (2026-09-15 through
2026-09-17): the per-project toggle, the slow-only speed set, and "Speed is an
input, so no shot plays at the source's own speed". The reasoning in those is not
wrong, it is simply no longer being paid for.

**Speed went because its only purpose went.** A shot never playing at 1.0 was an
anti-fingerprinting goal. With that goal dropped it is a moving part the planner
has to reason about — `speedFor`, `topSpeed`, `playedSourceSeconds` — for a
picture nobody can see the difference in. `pickShotSpeed` is deleted with it. The
PLANNER keeps its speed support: it is the generic way to say "this shot consumes
more source than its slot", it is tested, and it is simply not given one now.

**Mirror is ON, and that is the user's call against advice.** Every piece of text
inside the source reads backwards — signs, screens, phone displays, subtitles
already burned into the footage. The recap's OWN subtitles are safe, because they
are burned onto the concatenated video long after this filter. Recorded plainly
so nobody later reads the mirrored text as a bug.

**`MOVIE_RECAP_COPYRIGHT_TRANSFORM` is renamed `MOVIE_RECAP_LOOK`.** The old name
described a purpose that no longer exists, and a constant named for a dropped
goal is how a reader concludes the goal is still live.

**The "slightly raised default" was asked for and then withdrawn the same day —
see the entry below.** It was never applied to 16:9: both its cases were already
1, because a landscape frame has nothing spare to give.

**`MOVIE_RECAP_ZOOM.none` is deleted** — it meant "what a project carries when
copyright-free is off", and nothing read it even before that state stopped
existing.

## 2026-09-19 — Every zoom default is 1: no zoom, whatever the ratio

**Decision, by the user, replacing the "slightly raised default" asked for hours
earlier:** every entry in `MOVIE_RECAP_ZOOM.recommended` is 1. A project that has
never touched the slider renders at the source's own framing.

**What this gives up, so it is not rediscovered as a bug:** 9:16 `contain` was
1.56, and that number was doing real work — it is what kept a landscape source
from sitting in a narrow centre strip between two wide blurred bars. At 1 that
strip is back. If a portrait recap of landscape footage starts looking like a
small picture in a big blur, this is why, and the slider is the answer.

**The table stays keyed by fit mode and aspect ratio** even though all four
values are now equal. It is the SEEDING mechanism, not a tuning table: NULL
`copyright_zoom` means "use the recommendation for this pair", and keeping the
shape means raising one case again is a one-line change rather than
reintroducing a concept. The old values are recorded in the comment beside it.

## 2026-09-19 — The render outlived its own request: `-ss` was on the wrong side of `-i`

**Bug, found from a real failure:** a full render took over an hour and reached
beat 8 of 32. The browser had given up long before (`maxDuration = 300`), while
the pipeline kept running server-side — two orphaned renders were still burning
225% CPU each an hour later, because a dead HTTP request aborts nothing.

**Cause:** every shot was cut with `-i source.mp4 -ss <start>` — `-ss` AFTER
`-i`, which is OUTPUT-side seeking. ffmpeg then decodes the film from zero and
throws frames away until it reaches the cut point, so shot 200 re-reads 200
shots' worth of film to produce two seconds. A log line from the failure shows it
plainly: `frame=0 ... elapsed=0:00:16.12` — sixteen seconds of work, not one
frame emitted yet.

**Measured on the real 17-minute source**, one 3.5s shot starting at 241s:

| | |
|---|---|
| `-i` then `-ss` (what it was doing) | **17.0s** |
| `-ss` then `-i` | **1.54s** |

Byte-identical output either way: 105 frames, 3.500s, same dimensions. At ~300
shots that is roughly 85 minutes against 8.

**Fix:** `-ss` and `-t` move before `-i`. Input-side seeking makes the second
number a DURATION from the seek point where output-side `-to` was an absolute
timestamp, so the three branches now hand over how much source to read rather
than where to stop.

**Why it only appeared today:** the copyright-free branch had always seeked on
the input side, with a comment saying why. Removing the toggle sent every shot
down the other path, which had been the slow one all along and was simply never
the one a real render took.

**Also measured, and NOT a problem:** the hold-motion filter was suspected next,
since a first timing put it at minutes. That reading was taken while the two
orphans were saturating the machine. Cleanly, on a 1080p source through the 16:9
`contain` chain (split, blurred backfill, overlay): **1.03s without it against
1.51s with it**, same 180 frames and 6.000s out. Half a second per HELD shot is
not what needs attention.

**Still open: `maxDuration = 300`.** Even at ~1.5s a shot, ~300 shots is 5-8
minutes, which is at or past the limit. The request dying does not stop the
pipeline, so the failure mode is a browser error plus an orphan — the shape of
this whole incident. Raise the limit, or move the render off the request.

## 2026-09-19 — Cancel reset the row but did not stop the render

**Bug, caught live:** the user pressed Cancel, the UI said cancelled, the row
said `failed / Cancelled.` — and an ffmpeg kept running at 660% CPU, still a
child of `next-server`, still writing segments. Not an orphan: a render that had
been told to stop and had not.

**Cause:** `activeRenders` was plain module state. `next dev` recompiles a file
on every save, and the cancel route then imported a FRESH EMPTY map while the
pipeline it was meant to cancel carried on inside the old module instance. The
route found no controller and took its fallback branch, whose comment read
"Nothing is actually running, so it's safe to just reset it here." That
assumption was false.

**This also explains the two concurrent renders** from the incident above, which
had been left unexplained: a render survives a hot reload; Cancel resets the row
to `failed` without stopping it; the guard on the render route sees `failed` and
happily starts a second one.

**Two fixes, because either alone leaves a hole:**
- `activeRenders` (and the transcript run's map) now live on `globalThis`, so a
  hot reload keeps them and Cancel finds the controller it needs.
- The pipeline re-reads `render_status` between beats and stops itself when it is
  no longer `running`. That makes the row's reset an INSTRUCTION rather than
  bookkeeping, and it covers the case `globalThis` cannot — a controller that is
  genuinely gone while its work is not.

Between beats, not inside them: one indexed read per beat is free next to the
work, and it stops within seconds.

## 2026-09-19 — Narration audio is cached by what it says

**Decision, asked for by the user:** synthesized narration is stored in R2 and
reused when the same words are spoken by the same voice.

**The key is `sha256(providerId:voiceId + "\n" + text)`, and beat NUMBER is
deliberately not in it.** Keyed by position, reordering the script or editing one
line would invalidate every clip after it. Keyed by content, editing one line
costs one synthesis and the other thirty-one are free. Stored under the project
prefix, so the existing prefix-delete takes the cache with the project.

**Why it matters more than an API bill:** TTS for EVERY beat completes before any
video is cut, so a render stopped at "beat 6 of 32" had already paid for all
thirty-two clips and threw them all away. With the cache, stopping and restarting
— which is what tuning a render actually looks like — costs nothing for audio.

**The cached object is the TRIMMED clip, and its length is measured back off the
file** rather than stored beside it. That length sizes the beat's video, so it
must be right; one source of truth cannot drift from the audio it describes. A
cached object whose duration will not probe is re-synthesized rather than
rendered against a guess.

**`trimToSpeech` returns its INPUT when there was nothing worth trimming**, so
what gets cached is whatever it actually returned, not the output path it was
offered. Caching the wrong one would have stored an empty file.

## 2026-09-19 — Only the useful ends of a failure message reach the row

**Found while reading a real failure:** `render_error` held **85,975
characters** — ffmpeg's entire stderr, banner and build flags and several hundred
repeats of `Late SEI is not implemented`, with the one line that mattered buried
in the middle of it.

**Why that is not just untidy:** the project row is re-read every two seconds
while a render runs, so an 86KB message rides along on every poll. It is the same
reason the render analysis lives in R2 rather than in a column — anything stored
on this row is paid for repeatedly.

**Decision:** `trimFailureMessage` keeps the first 300 characters and the last
1,500, with a marker naming how many were dropped. The head is kept because it
names the command that failed; the tail because that is where ffmpeg puts the
reason. The middle is the banner. Applied to both the render and the transcript
run.

**The cut is announced, not hidden** (`… N characters trimmed …`). A truncated
log that looks complete is worse than a long one, because the next reader stops
looking for what is missing.

**Not done: writing the full stderr somewhere else.** It could go to R2 beside
the analysis. Nothing has needed it yet — every failure so far was legible from
the tail — and an object per failed render is a cleanup problem. Revisit if a
failure ever turns out to need the middle.

## 2026-09-19 — Starting a render is one statement, because checking then acting is a race

**Bug, caught with timestamps:** two temp directories were created in the SAME
SECOND (16:39:06) for one project. Two full renders ran at once — same beats,
same shots, same CPU — and whichever finished last would have overwritten the
row. The user had pressed the button once.

**Cause:** the route read `render_status`, decided it was not running, and only
later did the pipeline write `running`. Two requests arriving together both read
a non-running row and both passed. Classic check-then-act; the window is small
but it is real, and it was hit.

**Fix:** the route claims the render in ONE statement —
`update … set render_status='running' … where id = ? and render_status <> 'running'`
— and treats "no row came back" as the 409. Postgres arbitrates; exactly one
caller can flip a row out of `running`. The pipeline no longer writes that status
itself, since re-writing it there is what made the claim non-atomic. The same
change went into the transcript route, which had the identical shape.

**This is a different bug from the cancel one above**, though they produced the
same symptom. That one let a render survive a cancel; this one let a second
render start. Both had to be fixed to stop seeing two renders at once.

**The measurement that "cleared" the filter was wrong — see the entry below.**
It timed the hold-motion chain WITHOUT the trailing `fps` filter the render
always appends, and that filter was the whole bug. The 6m49s shot was not
contention; it was frames being duplicated without bound.

**Revised estimate for a full render:** ~300 shots at ~2s is about 10 minutes,
plus the download, with TTS now free from cache.

## 2026-09-19 — zoompan's timestamps made the render duplicate frames forever

**Bug:** one shot ran for over six minutes at 693% CPU, writing an 18MB file for
five seconds of video and still growing, on an otherwise idle machine with a
single render. It should take two seconds and 1.4MB.

**Cause:** `zoompan` hands on frames whose timestamps the `fps` filter — which
`segmentFilters()` appends to EVERY shot — cannot make sense of. It answers by
duplicating frames without bound. Counted on the real source, for a shot that is
163 frames:

| chain | frames in 20s |
|---|---|
| zoompan `fps=` + trailing `fps` (what shipped) | **9,401**, still climbing |
| zoompan `fps=`, no trailing `fps` | 163 |
| no hold motion at all | 163 |

**Fix: `settb=1/fps,setpts=N` after zoompan**, rewriting the stamps as a clean
frame count so the trailing `fps` has nothing left to conform. Verified as the
render actually builds it: **1.95s, exactly 163 frames, 5.433s, 1.4MB.**

**Dropping zoompan's own `fps=` is NOT the fix**, though it looks like one from
the table above. It was tried first and still ran away, because the trailing
`fps` is always there in the real chain. The option stays out regardless — the
trailing filter is the one place the pipeline sets the rate — but the timebase
rebuild is what actually works.

**Why two earlier measurements missed it, recorded because the mistake is the
lesson:** both timed the hold-motion chain without the trailing `fps` filter. A
filter chain assembled by hand for a benchmark is not the chain that ships. The
third measurement generated the string from `holdMotionFilter` itself, appended
`fps=30` exactly as `segmentFilters()` does, and ran it against the real source —
and found it in one run. Benchmark the built artefact, not an approximation of it.

**Guarded by tests** that assert `settb`/`setpts=N` follow `zoompan`, and that
`zoompan` carries no `fps=` of its own.

**This also explains the earlier 6m49s shot** that was blamed on two renders
competing. They were competing, and that was its own bug, but this is what made a
single shot unfinishable.

## 2026-09-19 — held frames push in, they no longer pan

`holdMotionFilter` used to slide the picture sideways while it pushed in, with
`pickHoldDrift` picking a per-shot direction so a run of held shots did not all
move the same way. The drift is gone: on a held frame the pan was the part that
read as an effect rather than as a living picture, and the push-in on its own
already does the job the motion was added for.

`MOVIE_RECAP_HOLD_MOTION.drift` was removed with it. `pickHoldDrift` is left in
`lib/movie-recap.ts` unused, deliberately — it is cheap to keep and the
deterministic-hash approach is worth having if a future motion needs a per-shot
choice.

Nothing else about the hold changed: it still applies ONLY to a shot whose slot
outlasts its footage, and the `settb`/`setpts=N` timebase rebuild after zoompan
is still load-bearing (see the entry above it).

## 2026-09-19 — beats are the film's own scenes, and the SPEECH bends to fit them

Measured on a real 16:9 export (7 blocks, 185.5s, 35 shots): **56.41s of held
frames, 30% of the video.** The genuine shortfall was 19.2s — the source is
170.2s and the narration needed 184.5s — so **37s of the freeze was
self-inflicted**. The planner was opening a gap between adjacent windows so a cut
would read as a cut (`MIN_JUMP_S`), and then freezing to pay for the footage it
had just skipped. On an earlier 32-block export the same arithmetic produced 44s
held against 44s skipped, spread as 0.6–2.3s at the end of every one of 154
shots — which is what reads as a broken render, not the total.

### Decided

**A beat is a SCENE, not a block.** The render detects the source's cuts, takes
the scenes inside each hand-timed block, and makes one beat per scene. The
block's Burmese passage is divided across them.

**The picture no longer moves to fit the words; the words move to fit the
picture.** Every second of the user's block plays, in order, at its own speed.
Each beat's line is then re-read at the rate that makes it as long as its scene
(`lib/movie-recap-narration-rate.ts`, clamp 0.92–1.15 on the voice's own rate).
On the export above that takes the hold from 56.41s to ~5.8s, all of it in one
block whose text is 46% longer than its timestamps allow.

**Which sentence goes on which scene is a vision question.** One keyframe per
scene is described, and the block's passage is split across the scenes by
`splitMovieRecapBeat`. It NEVER writes narration — the Burmese is the user's —
and the result is verified character-for-character against the passage before it
is used (`resolveSceneTexts`). Anything else falls back to a mechanical
sentence split weighted by scene length, which is also what runs when the pass
fails or is skipped.

**A block that cannot be fitted is the user's to fix.** The Transcript step warns
before the render: "27s of video, about 39s to read." No rate makes that line fit
and no planner can invent footage.

**Leftover hold lands on the LAST shot of a beat, alone.** Spreading it evenly is
what produced 154 small stutters instead of one deliberate held push-in.

### Rejected / superseded

- **The 2026-09-19 "scene detection is not needed" decision is superseded.** It
  was right while a block was a beat; it is not once cuts have to land on the
  film's own edits. `Scenes` and `Script` are live steps again, and only
  `Dialogue` stays parked (nothing transcribes the source).
- **Slowing the VIDEO to fill the gap** (`SPEED_RAMP_MIN`) was the earlier answer
  and was considered again here. Rejected by the user in favour of moving the
  speech: the footage plays at its own speed, always.
- **Speeding the voice past the clamp.** Beat 1 of the export wanted 1.46x on top
  of the voice's +15%, i.e. +68%. That is not a recap.
- **A proportional text split.** The cut lands where a part ends, so a mechanical
  split cuts mid-clause and the picture changes in the middle of a thought. It
  survives only as the fallback.
- **The 0.15s inter-beat breath** is gone. A beat's length is its scene's footage
  exactly, so a gap on top of it is time with no picture behind it — the freeze
  it was added to prevent is the freeze it would cause. The pause did not go with
  it: a beat is a whole sentence or two, so the clip already begins and ends on
  one.

### Consequences a later reader should not "fix"

- **The narration cache key now includes the rate** (`narrationHash`). The same
  words in the same voice legitimately have several clips of different lengths;
  drop the rate and a beat gets some other render's tempo and drifts out of sync
  for the rest of the video. An unfitted clip keys as before, so older caches
  still hit.
- **TTS is called up to twice per beat** — once to find out how long the line
  runs, once at the fitted rate — and the fitted reading is kept only when it
  actually lands closer, because Azure's rate is not exactly linear in duration.
  Both readings are cached, so a re-render pays nothing.
- **Slots are per-shot, not per-beat.** A scene's own pieces are not all the same
  length, so one average slot would stretch one and squeeze the next. Captions
  are held for the sum of the slots they cover for the same reason.
- **Cost scales with scene count, not block count**, which is why a block is
  capped at `MAX_SCENES_PER_BLOCK` (12). A scene is a keyframe, a share of a
  vision call and a TTS call of its own, and a block whose passage is four
  sentences cannot use twenty of them — the extra scenes come back with no text
  and are merged into their neighbour anyway, after being paid for. The cap costs
  the picture nothing: merging only makes a longer window, and
  `splitSceneIntoShots` still cuts it every few seconds. Merging is
  shortest-first, so what goes is the quick cutaway rather than the scene that
  carries the block.
- **Reasoning effort is set deliberately**: `low` on the vision pass (describing
  a frame is recall, and it runs once per eight scenes across the whole film),
  `medium` on the split pass. Dropping the split to `low` makes it divide by
  length, which is what the free mechanical fallback already does.
- **The mock render still uses `planBeat`.** It has no detection and no audio, so
  there are no scenes to align to — it is the one path left that sizes the beat
  from its captions.

## 2026-09-19 (later) — the radio cut: one reading speed, and the picture runs under it

Two things were wrong with the scene-aligned render above, both found by
watching it rather than by measuring it.

**The narrator would not settle.** Fitting each beat's rate to its own scene
(0.92–1.15) lands every number and sounds like someone speeding up and slowing
down every few seconds. It is worse than the freeze it replaced.

**Held frames shook.** `zoompan` places its window on whole pixels, so a slow
push-in holds for a few frames and then jumps one. `prescale: 2` halved that and
was not enough to hide it.

### Decided

**The documentary order: lock the audio, then lay picture under it.** This is the
"radio cut" — editors finish the narration with no picture at all, then run
footage underneath. Automated narration pipelines land on the same rule from the
other direction: the synthesized audio's duration IS the clock. So:

1. **One reading speed for the whole recap.** The script is read once at the
   voice's own rate, measured, and — if it misses — read again at
   `totalAudio / totalFootage`, clamped by `MOVIE_RECAP_NARRATION_RATE_FIT`. On
   the 170.2s export that is about +8% on top of the voice's +15%, once, for
   everything. Per-beat fitting is gone.
2. **The source is one ribbon** (`lib/movie-recap-ribbon.ts`). Each beat takes
   exactly as much footage as its clip is long. A beat whose line runs long
   borrows from the footage after it; one that runs short gives footage back.
   Nothing is frozen, nothing is stretched.
3. **Timestamps are targets, not sync points.** The offset between where a block
   was typed and where its picture actually sits is the drift, corrected only
   when it passes `MOVIE_RECAP_RIBBON.driftCapS` (5s) — and only at a block
   boundary, never inside one. This is the L-cut principle: the picture and the
   words are not supposed to cut together.
4. **Every jump lands on one of the film's own cuts.** The first frame snaps
   within 1s, a drift correction within 2s. A jump that lands mid-scene reads as
   a glitch; the same jump on a real edit reads as an edit.
5. **Held frames render large and shrink.** zoompan now outputs at
   `supersample: 2` and the chain scales back down, so its whole-pixel step
   becomes half an output pixel and the downscale averages it away. Measured on
   a 3.5s 9:16 shot: 1.19s → 1.43s, same 105 frames.

### Rejected

- **Per-beat rate fitting** — see above. Kept in the code as the same function,
  now called once for the whole script.
- **Correcting drift mid-block.** It would cut a sentence's own picture in half
  to satisfy a number.
- **Raising `prescale` to 4** as the shake fix. It makes a 9:16 frame
  4320x7680 to fix a fraction of a pixel; supersampling the output is the cheaper
  half of the same idea.

### Consequences

- **The picture no longer matches the typed timestamps exactly**, by design, up
  to 5s. That is the price of never freezing and never changing tempo, and the
  user chose it knowing so.
- **A scene the passage had nothing to say about no longer becomes a beat.** With
  the narration as the clock there is no slot for silent footage; those seconds
  are not lost, the ribbon plays straight through them inside a neighbouring
  beat's window.
- **`render_script` is written AFTER synthesis**, not before it: the windows do
  not exist until the narration has been read. A render that dies during TTS now
  leaves no script behind, which is the trade for a re-render reproducing the
  exact cut the user saw.
- **A re-render never re-walks the ribbon.** Its stored script already carries
  the windows; walking again against different audio would move every cut.
- **The whole script is synthesized twice on a first render** (once to measure,
  once at the fitted rate). Both readings are cached by `narrationHash`, which
  includes the rate, so it is paid once.

## 2026-09-19 (later still) — the script becomes its own step, measured and approved before anything is cut

Watching the scene-aligned render answered two questions that no measurement
had: a narrator whose rate changes every few seconds sounds wrong, and the
question "is this line too long for its shot" has a definite answer — a
synthesized clip and a stopwatch — that was being discovered an hour and a half
into a render.

### Decided

**The script run is a separate job.** `lib/movie-recap-script.ts` reads the
source, detects its cuts, describes one keyframe per scene, divides each block's
passage across those scenes, and then SPEAKS AND MEASURES every beat. It writes
`render_script` with each beat's `audioS` and stops. Its own status columns
(`script_status`, `script_stage`, `script_progress_*`, `script_error`,
`script_approved`), because a failed script run must not read as a failed render.

**The user approves before anything is cut.** The Review step's script panel
shows, per beat, its footage, its measured narration and any overrun. Editing a
line touches THAT BEAT ALONE (`POST script/beat`) — the scenes, the split and
every other clip are untouched. Two ways to commit it: *Re-check* re-speaks the
line and re-measures it, *Save without re-checking* stores the words and marks
the beat `audioStale`, because an edit that plainly cannot move the timing does
not deserve a TTS call. A stale beat keeps its old number — it is the previous
wording of the same line, not a guess — and the row says so. `script_approved`
is cleared either way, and the render route refuses to run without it.

**The render is ffmpeg.** It loads the approved script and the analysis blob,
reads every narration clip from the R2 cache, and cuts. It no longer detects,
describes, splits, or writes a script; `reuse` is gone because every real render
is now what `reuse` used to mean.

**No borrowing, and no rate fitting.** Each beat plays its own scene's footage
and is read at the voice's own rate. An overrun is not something the pipeline
should solve behind the user's back — it is words that do not fit, and the fix is
theirs.

### Rejected

- **Borrowing footage from the next block** (`lib/movie-recap-ribbon.ts`,
  written and tested a few hours earlier). It removes freezing completely, but it
  moves the picture away from the timestamps the user typed and there is no way
  to show them that before the render. Kept in the tree, unwired, with its tests
  — the drift/snap arithmetic is right, and it is the answer if the manual step
  ever becomes tiring.
- **One fitted rate for the whole video.** It sounds correct — that part was
  right — but the rate is part of the narration cache key, so editing one line
  re-reads every other line. That is incompatible with a script step whose whole
  promise is that fixing a beat costs one beat.
- **Blocking approval while any beat overruns.** A second or two of held frame is
  sometimes the right call; the panel says how many beats will hold and lets the
  user approve anyway.

### Consequences

- **Two long runs per project**, each cancellable, each with its own bar
  (`MovieRecapRenderProgress` takes a `phase`). They share the stage names
  because they are the same pipeline cut in half.
- **The render's cost moved, not vanished.** Detection, vision, the split and all
  the TTS are paid in the script run. A render after it is ffmpeg plus cache
  downloads.
- **`render_script` is no longer whatever the last render wrote.** It is the
  script step's output, and the render never rewrites it.
- **A mock render still ignores all of this** — no script, no approval — because
  it exists to check framing and subtitles for free.

## 2026-09-20 — the script gets its own wizard step

Add Source -> Transcript -> **Narrative Script** -> Customize Video -> Review.

The beats were living in a panel at the bottom of Review, under the render
controls, which put the thing you have to read BEFORE rendering below the button
that renders. They are their own step now, and Review no longer carries them.

`Project Settings` is gone as a step — name, output language and voice are three
fields and are now the first section of Customize Video. The step count stays at
five.

**"Rebuild script" is now "Resync with Script", and it asks first.** The
distinction it draws is the one the whole step depends on: everything else —
re-checking a beat, saving one — reads the stored beats, and only this goes back
to the Transcript step's text and replaces them. It is the single action that
discards edits made here, so it is the single action that confirms.

### Checking without resyncing

`POST script/recheck` speaks and measures every beat again exactly as they
stand — the beats are read, the transcript is not. It is the answer to "do these
lines still fit?" after a run of edits saved without re-checking, and it moves
nothing: no detection, no re-split, no shot changed. A line whose words have not
changed is a cache hit, so it costs TTS only for the ones that were saved
un-measured.

Three actions on the step, deliberately separate, in order of what they throw
away: re-check one beat (nothing), re-check all beats (nothing), Resync with Main
Script (every edit here). The last one is in its own section at the bottom with
its own heading, after a mis-click next to Approve was the obvious failure.

### 2026-09-20 — the beat floor is what fixes overruns, not the words

A real export: 170.2s of film, 60 beats, **27 of them overrunning by 42.2s in
total**. The obvious reading is "too much text", and it is wrong — the whole
narration measured 177.3s against 170.2s of film, 4% over. The beats that
overran were paid for by neighbours sitting 35s UNDER.

It was granularity. The film cut 75 times in 170s, `MIN_SCENE_S` was 1, so a beat
averaged 2.8s — and one Burmese sentence takes 3 to 8 seconds to say. Nothing
about the writing could fix that; a sentence does not fit a 1.1s scene.

`MIN_SCENE_S` was raised to **4** on that measurement and put back to **1** the
same day, at the user's call, before a render had been cut either way — so the
finding stands and the setting is open. It is the shortest a BEAT may be, and it
is not the shot length: merging two of the film's cuts makes a longer window, which
`splitSceneIntoShots` still divides every `maxContinuousSourceS` on screen. The
two limits are independent and confusing them is the trap — a longer beat must
never mean a stiller picture, and there is a test that says so.

**Merging brought two consequences, both fixed here rather than left open.** A
beat now spans several of the film's real scenes, so:

- **`splitSceneIntoShots` takes the cut list and splits on the edits first.**
  Dividing the merged window evenly would sooner or later lay a shot across an
  edit — one shot to the pipeline, a picture that changes halfway through to the
  viewer. Every shot is now a piece of ONE scene; the continuity limit then
  applies inside each run. A run under `minShotS` is absorbed into its neighbour,
  which does then contain an edit — the lesser of the two problems, and what the
  floor exists to choose.
- **The keyframe comes from `dominantRun`, the longest unbroken stretch in the
  beat**, not from a third of the way into the merged window. That position can
  land on a two-second cutaway while the scene the beat is actually about fills
  the rest, and the split pass would then match the user's sentence to the
  cutaway.

### 2026-09-20 — the spoken-pace estimate was wrong by two seconds a beat

Checked against real data for the first time: 30 beats whose `audioS` had been
measured, fitted against their character counts. Burmese at the narration voice's
+15% is **18.2 characters a second, flat** — 0.0549s per character with an
intercept of -0.1s, accurate to 0.47s on average and 2.05s at worst.

The estimate in use was a two-rate model (12.5 chars/s for the first 20
characters, 36 after) from a much earlier pipeline. Nothing is read at 36
characters a second, so it under-estimated EVERY beat, by 1.83s on average and
6.24s at worst. The Transcript step's overrun warning was built on it and
therefore almost never fired when it should have.

Replaced with the flat measured rate, and the warning's threshold with it: it was
`footage * 1.15`, which came from the rate-fitting that no longer exists, and is
now `footage + 1s` — one second because the estimate itself is good to about
half, and a warning that fires on rounding is one people stop reading.

The method is written into `lib/movie-recap-speech.ts` so this can be redone
after a voice or rate change: fit `audioS` against the whitespace-stripped
character count of `text`, over any project's stored `render_script`.

### 2026-09-20 — the block ribbon: borrow inside a block, never across one

Measured on the real export, per block rather than per beat:

```
block  footage  audio   block deficit   beat-level overrun
  1     27.0    37.1        10.1              23.0
  2     24.0    23.8         0.0              16.8
  3     24.0    25.7         1.7              17.7
  4     25.0    26.2         1.2              16.6
  5     22.0    20.5         0.0              12.5
  6     24.0    23.4         0.0              15.5
  7     24.2    24.4         0.2              11.4
 all   170.2   181.1        13.2             113.4
```

**113s of overrun against 13s of real deficit.** Blocks 2, 5 and 6 have footage
to spare and still had beats freezing inside them — the footage was next door,
under the neighbouring line.

`layoutBlockRibbon` lays a block's narration over its footage as one strip: the
beats decide which words play in what order, and the footage is handed out by
what each line actually needs. A long line takes from the beat after it, a short
one gives footage back. Inside a block that costs nothing — the pieces play in
order and touch, so there is no jump anywhere.

**Block edges never move.** Borrowing across one would take footage the user
assigned to different words, and their timestamps are the one thing in this
pipeline that is not negotiable. That is the difference from
`lib/movie-recap-ribbon.ts`, which borrows across blocks and stays unwired.

A block that is genuinely over-subscribed shares the shortfall across its beats
rather than dumping it on the last one — half a second held under each of six
beats reads better than a twenty-second still at the end.

Consequences:

- **Re-laying happens whenever a measurement changes**, so re-checking one beat
  moves the pictures under its whole block — and only that block.
- **The text-to-picture match loosens by a second or two.** The split pass
  matched each line to a scene's description; the ribbon then gives that line
  whatever footage its length needs, starting from where the previous line
  ended. Order is preserved and the drift stays inside the block.
- **Beat length stopped mattering**, which is why `MIN_SCENE_S` went back to 1:
  a short beat is no longer a beat that freezes, it is a beat that borrows.

### 2026-09-20 — narration rate +15% -> +20%, and the rate joins the cache key

After the block ribbon, what was left was a real shortfall: the story ran 177.3s
against 170.2s of film, and six of the seven blocks were within a couple of
seconds of fitting. Trimming the writing to close that is the user's work, and
not always possible; reading it a little faster is free.

Measured per block:

```
rate    block1  block3  block4  block7   total short
+15%     10.1s    1.7s    1.2s    0.2s      13.2s
+20%      8.5s    0.6s    0.1s       -       9.2s
+22%      7.8s    0.1s       -       -       7.9s
```

**+20%.** Every block except the first now fits, and the first is 37% over on
text — no reading speed rescues that, and the Narrative Script step says so per
beat.

**The voice's rate is now part of the narration cache key.** It had to be:
raising the rate changes how long every line takes, beats are sized from that
measurement, and a cache hit at the old speed would put the speech off the
picture for the rest of the video. Changing the constant therefore invalidates
every clip, which is correct — they are recordings at the wrong speed.

Two things must follow a rate change, and both are written where the constant is:
re-measure `CHARS_PER_SECOND` (scaled provisionally to 19.0 here), and run
`scripts/generate-voice-previews.ts` — done, both previews regenerated.

The SSML test that pinned the rate to `"+15%"` now pins the DIRECTION instead. A
test that hard-codes a tuned number only ever fails the person tuning it.

## 2026-09-20 — one global playback speed, and the conditional speed-ramp is gone (supersedes the 2026-09-17 ramp-band entries)

**Decision:** every shot plays at `MOVIE_RECAP_PLAYBACK_SPEED = 0.95`. The
`SPEED_RAMP_MIN`/`SPEED_RAMP_MAX` band is deleted along with the per-shot
`speedFor` plumbing, and the render's segment loop has two branches instead of
three: the scene either covers `slot * speed` seconds or it is freeze-padded for
the rest.

**Why the band went:** it was conditional, and that is what the user objected to
— a recap whose picture changes pace from shot to shot. Measured on the 49-beat
script for project `1e7c440f`, the band was also catching nothing. The beats are
bimodal:

```
ratio 1.00-1.05  ->  21 beats, 1.19s over
ratio 1.05-1.25  ->   0 beats
ratio 1.25-1.40  ->   6 beats, 9.20s over   (all of block 0)
```

Nothing lives in the middle, which is where a ramp band earns its keep.

**Why 0.95:** it is the knee. Against that same script, remaining held frames by
speed — 1.00: 10.39s over 14 beats; 0.97: 8.78s / 11; **0.95: 7.78s / 6**; 0.92:
6.85s / 6; 0.90: 6.20s / 6. Below 0.95 the freeze count stops falling, because
everything left is block 0, whose text is 34% longer than its own timestamps and
which no playback speed can rescue. Going slower only makes the slow motion
visible — the 2026-09-17 objection to 1.25 (~0.8x) stands and is the lower bound
here.

**Superseded:** `SPEED_RAMP_MAX stays 1.15` (2026-09-17) and the narrowed
`[0.96, 1.07]` copyright speed set. Their reasoning is kept above: a conditional
slowdown past ~0.87x reads as deliberate slow motion. A global 0.95 does not,
because nothing around it plays at another speed to compare against.

**The trap this introduced, in three places:** a window's SOURCE length is no
longer its SCREEN length. `beatFootageS`, `layoutBlockRibbon` and
`manualScriptOverruns` all divide by the speed now, and `planBeat`'s `padding`
warning had to move from `slot - windowLength` to `holdDeficit` — measuring the
raw difference made every healthy shot report 5% of its slot as held frames.
Anything new that compares audio seconds against a source window has to do the
same.

**Still open:** block 0. 27.0s of film under 36.2s of narration. Only a later
timestamp or fewer words fixes it, which is what the Narrative Script step is
for.

## 2026-09-20 — a timestamp may carry its own line's words

**Decision:** `parseTimestampedBlocks` accepts `MM:SS words…` at the start of a
line, not only a stamp alone above a wrapped paragraph. A stamp anywhere else on
the line is still narration, so `"he leaves at 00:01:00 sharp"` does not split.

**Why:** the user's transcripts are now pulled off the source video's own
narration track, one line per stamp. That layout parsed as ZERO blocks and said
nothing about it — the Transcript step showed no overrun warnings and the script
build had nothing to work with. Both layouts are real; the parser takes both.

## 2026-09-20 — the ribbon lays narration over GROUPS of stamps, not single stamps

**Decision:** consecutive timestamped blocks are merged into ribbon groups of at
least `MOVIE_RECAP_RIBBON_GROUP_S = 25` seconds (`groupBlocks`). A group's two
outer stamps are walls; the stamps inside it are where the ribbon starts each
line before it adjusts. `manualScriptOverruns` measures per group for the same
reason, and a beat carries `groupIndex/groupStartS/groupEndS` beside its block
fields so a re-measured line can be re-laid without re-reading the transcript.

**Why:** the transcripts changed shape. They are now pulled off the source
video's own narration track, one stamp every 3-4 seconds, so every block became
its own wall. Burmese takes about 13% longer to say than the English it was
translated from, and that excess is not spread evenly — measured across 40 lines
of a real script, the per-line ratio of speech to footage ran from 0.79 to 2.03.
A 3-second wall cannot absorb that: a line running 87% long sat next to one with
1.5s spare and could not reach it.

Measured on that script, at `MOVIE_RECAP_PLAYBACK_SPEED`:

```
per-line walls (40)   24.8s of held frame
25s groups (6)        15.1s
```

And with the text also cut to fit (the still-unbuilt shortening pass), 12.2s
against 2.6s. Grouping roughly halves what shortening then has to remove: 399
characters per-line against 215 per-group, and no line needing a 30-50% cut.

**The cost, stated plainly:** a line can start up to about 2s from its own stamp.
Measured inside the first group: drifts of 0.98, 1.32, 1.89, 1.28, 1.39s. With
scenes averaging 1.57s that can be a scene off. Drift returns to zero at every
group edge, so it never accumulates across the story.

**Why 25s:** it is the block size this feature already shipped and was accepted
with, when the transcripts carried a stamp every 25-30 seconds. 40s groups leave
less held frame and drift further; 15s groups drift less and leave more.

**Superseded:** "Never borrow across block boundary" now means across a GROUP
boundary. The reasoning stands — the user's timestamps are what tie words to
pictures — but a stamp every 3 seconds is a placement mark, not a contract.

**Also here:** the split pass is skipped for a one-sentence block, and so are
the keyframe and vision passes behind it. `resolveSceneTexts` cannot break inside
a sentence, so the model's answer could not change the result, and the vision
pass exists only to answer which sentence belongs on which picture. One sentence
per stamp made all three run for every scene in the film for nothing — 40 split
calls, and a keyframe and a vision call for each of roughly a hundred scenes.
Only the scenes under a block that will actually be split are described now.

## 2026-09-20 — the Transcript step MEASURES the overrun; it does not rewrite the story (supersedes the shortening pass, same day)

**Decision:** the Transcript step shows a table — section, seconds of video,
seconds to read, seconds over, characters to cut — and stops there. The user
makes the edit. `manualScriptOverruns` carries `overS`, `chars` and
`budgetChars` so the number is exact, and `budgetCharsFor` turns a stretch of
footage into the characters it can hold.

**What was removed, hours after being built:** an AI pass that rewrote the user's
Burmese to fit (`shortenMovieRecapLines`, `lib/movie-recap-shorten.ts`,
`lib/prompts/movie-recap-shorten.ts`, `lib/prompts/movie-recap-voice.ts`, the
`transcript/shorten` route and its accept/reject UI). The user's call: the
writing is theirs, and a machine editing it is not what they want even with a
diff to approve. Analysis is the useful half.

**Kept from it, because it was measured and is worth not re-deriving:**

- A group is the unit. A line running long beside one with room to spare is not
  an overrun, and warning about it teaches people to ignore the warning.
- Per-line budgets needed 399 characters cut across 22 lines of a 40-line script,
  five of them by 30-50%. Per-GROUP budgets needed 215 across 4 groups, none
  worse than 17%. That is the number the table now shows.
- A model asked to shorten Burmese finds its characters in the polite sentence
  endings first — ပါတယ် flattened to တယ် on nearly every line — and in spelling
  counts as digits. If a shortening pass is ever wanted again, the register has
  to be named as something that never gets cut, and the sample of the house voice
  the user pointed at is in the conversation that produced this entry.

## 2026-09-20 — overruns are fixed by tightening the user's own Burmese, not by rewriting it (SUPERSEDED same day — the pass was removed, see above)

**Decision:** the Transcript step can ask a model to say the same thing in fewer
Burmese words, one ribbon group at a time, and PROPOSES the result. Nothing is
written until the user accepts line by line (`Shorten what overruns` →
`lib/movie-recap-shorten.ts`, `shortenMovieRecapLines`, the
`transcript/shorten` route). Rejected alternatives, in the order they were
raised and dropped:

- **Re-translating from the English with a per-line character budget.** The
  user's answer: do not translate again, tighten what is already written. The
  Burmese is theirs and has been read; a fresh translation is a new draft to
  proofread.
- **A per-LINE budget.** Measured on a 40-line script, per-line budgets needed
  399 characters cut across 22 lines, five of them by 30-50%. Per-GROUP budgets
  needed 215 across 4 groups, none worse than 17%.

**Why a group at a time:** the group is what has to fit. A line running long
beside one with room to spare is not an overrun, and asking for it to be cut
takes words off writing that was fine.

**The guard, and why it is not configurable:** a group needing more than
`MAX_SHORTEN_FRACTION = 0.3` is reported and never sent. Past about a third the
model stops tightening phrasing and starts dropping facts — and it does it
silently, which is worse than a held frame. The honest fix there is a later
timestamp, which is the user's to make.

**Two more refusals in `shortenProposals`:** a reply with a different number of
lines is discarded whole, because the lines are positional and a short reply
would shift every line after it onto the wrong timestamp; and a "shortened" line
that came back longer is dropped, because that is the model rewriting rather
than cutting.

**Measured on the 40-line script**, at `MOVIE_RECAP_PLAYBACK_SPEED` and the
current voice rate: 24.8s of held frame per-line, 15.1s with groups, about 2.6s
with groups and this pass. The last of it is one group and a hand edit.

**Consequence worth knowing:** applying accepted lines rebuilds the story from
the parsed blocks as `MM:SS words`, so a story typed in the other layout (stamp
alone on its own line) comes back in this one. Both parse.

## 2026-09-20 — the house voice is a constant every Burmese pass reads (SUPERSEDED same day — the file went with the shortening pass; the findings stand)

**Decision:** `lib/prompts/movie-recap-voice.ts` holds a sample of the
storytelling register the user wants, plus the rules that sample is there to
demonstrate. The shortening pass includes it; the retelling pass should too if it
is ever wired back up. Change the sample to change the house voice.

**Why:** the first real run of the shortening pass came back 597 -> 494
characters with the facts intact and the voice gone. It had found its characters
in the sentence endings — ပါတယ် flattened to တယ် on nearly every line — and in
spelling counts as digits (နှစ်ယောက် -> ၂ ယောက်). Both read as a different,
flatter narrator. The politeness IS the voice, so it is now named as something
that never gets cut, and the model is given a list of what to take instead.

**The sample is raw text from a channel, typos and run-ons included.** That is
deliberate — it is a register reference, not a quality model — so the prompt says
in as many words to take only the voice from it, and that nothing in it is part
of the story being worked on.

**Second finding, from the same run:** adding the voice rules alone made the pass
refuse to cut at all (597 -> 589, five of six lines returned untouched). A
constraint on HOW to cut reads as permission not to. The budget had to be
restated as the job — with `currentChars` sent alongside it so the model can work
out how much to remove — and the WHAT TO CUT list given as concrete Burmese
substitutions that each keep the polite ending. The pass then landed 597 -> 504
against a 540 budget with the register intact.

## 2026-09-20 — the Narrative Script is authoritative; only Resync may replace it

**Decision, the user's, stated as a rule:** once the beats exist, nothing may
change them except `Resync with Main Script`. Editing the transcript does not
reach them, re-checking does not reach them, and leaving the step must not lose
them. The script step is where the words are final.

**It was already true on the server** — `remeasureMovieRecapScript` and
`saveMovieRecapBeat` both carry `beat.text` forward and only
`runMovieRecapScript` reads the transcript — and it was checked rather than
assumed: the render_script of the project this came up on was character-for-
character identical to `transcript_story`, which only a resync can produce.

**What actually lost the work, and it was a UI trap.** While any beat has unsaved
edits, both `Re-check all beats` and `Approve script` are disabled, silently. The
only control left alive on the panel is Resync — the one that discards. Someone
trying to make progress clicks the button that works.

Three things now:
- The disabled state says why, and names how many beats are waiting.
- The Resync dialog counts the unsaved beats and says they go too.
- Leaving the step with unsaved beats asks first. The drafts live in the step's
  own state and the step unmounts on a step change, so that navigation was
  silent data loss.

**Not done, deliberately:** the drafts are still component state rather than
being persisted. Saving every keystroke to the row would make an edit a write,
and the two buttons under each beat exist precisely so the user decides when an
edit costs something.

## 2026-09-20 — overruns leave and come back as one block of text

**Decision:** the script step copies its overrunning lines out as a prompt and
reads the reply back in one paste (`lib/movie-recap-beat-transfer.ts`, the
`script/beats` route). No model is called from here; the user shortens the lines
in whatever chat they already trust with Burmese.

**Why not an in-app pass:** one was built and removed the same day — see the
entry above. Analysis is what the app is good for; the writing is the user's.
This keeps the measurement here and puts the editing where they already do it.

**Beat numbers are the anchor, not the text.** `[Beat 7 | 1.2s over]` — only the
number is parsed, and a number outside the script is
dropped rather than applied to a neighbouring line. Anchoring on the text would
break on exactly the change the round trip exists to make; landing an edit on the
wrong beat is worse than losing it.

**The prompt is two sentences and no rules** (user's call, after trying rules).
Every rule that was tried came off again: a character budget (derived from a
still-provisional `CHARS_PER_SECOND`, so it read as precision it did not have),
and register rules about polite endings and spelled-out numbers. What is left
says what the lines are and how to reply. A known consequence, seen on the first
real reply: a chat asked only to shorten will also SWAP words — `သစ်တောအုပ်` came
back as `သစ်တောနက်`, which is a different thing — and may drop the sentence-final
`။` that `splitIntoSentences` counts on. The paste is reviewed before it is
applied, and that review is the control.

**Seconds, plus how many characters to REMOVE** — `[Beat 7 | 1.2s over | remove
about 23 characters]`. Three shapes were tried and the middle one is the one not
to repeat: `about 96 characters fit` reads as a length to rewrite TO, and on a
real reply it cost far more than it asked. Beat 1 of a real script, 88 characters
and 0.3s over, came back at 56 characters and 2.60s against 3.60s of footage —
1.3s cut where 0.3s was wanted, and `ပြင်းပြင်းထန်ထန်`, the one word carrying how
bad the injury was, gone with it. Seconds alone was tried next and put back:
a chat has no feel for "0.3 seconds of Burmese" and guesses, and guessing
over-cuts the same way.

So: the seconds are the target, and the characters are a delta — how much to
remove, never a length to land on. Both are estimates on a line of Burmese digits
(see lib/movie-recap-speech.ts), which is why it says "about".

Fixing a 0.3s overrun by cutting a third of the line is the wrong trade: do that
across forty beats and the recap thins out to solve a held frame nobody sees.

**The parser is deliberately forgiving**, because the text has been through a
chat window and a clipboard: anything before the first header is dropped (models
open with "Here you go"), a beat wrapped over several lines is joined, and a
header with nothing under it is ignored rather than emptying that beat.

**It lives in a modal now**, opened by `Fix overruns` beside the script's own
menu, and holds its own state: a dialog shown imperatively renders a snapshot of
what it was handed, so the paste and the in-flight write have to live inside it
rather than in the panel that opened it. As an inline panel it sat above the
beats it was about and pushed them down the page whether or not anyone was using
it.

**Applying never speaks.** The beats are marked `audioStale` and written in ONE
update — a per-beat save reads and rewrites the whole script, so a loop of them
races itself. A re-check afterwards pays for the lines that changed and reads the
rest from cache.

## 2026-09-20 — the render never writes `render_script`

**Bug, found by the user running a mock preview:** every render finished by
writing `render_script: narration` onto the row. On a real render that was a
no-op — `narration` is `project.renderScript`, read back unchanged. On a MOCK
render `narration` is `mockNarration()`, six canned lines, and the write replaced
an approved, measured script with them. The Narrative Script step then showed
mock data, and the only way back was a resync.

**Fix:** the render writes its status, its output and nothing about the script.
The script run owns `render_script`; only a resync replaces it. That rule was
already written down (the entry above) — the render had simply never been
revisited after the script step took the column over.

**Why it survived this long:** the render used to build the script itself, so
writing it was correct then. The script step took that over and the write stayed
behind, harmless on the path anyone tested.

## 2026-09-20 — every beat keeps the line it was born with

**Decision:** a beat carries `originalText`, written once by the script run and
never touched again. `Restore original` puts it back in one beat's box;
`Restore N originals` in the header writes back every saved line that has drifted
from it, through the same bulk route a paste uses.

**Why:** applying a paste replaces many lines at once, and until now there was
nothing to compare against or go back to — a paste that turned out worse than
what it replaced was simply the new text. Undoing that beat by beat is not
undoing it.

**Why on the beat and not in a column:** `render_script` is jsonb, so this needed
no migration, and every write path already spreads the beat (`{...beat, text}`),
which carries the field through without a single change to them.

**Per-beat restore fills the BOX, not the row.** It is reviewed and then saved
like any other edit, so it costs nothing until it is wanted and the existing
Save / Re-check choice still applies. The header's restore does write, because
its whole point is undoing a bulk change in one action.

**What it does NOT protect against:** a resync. That rebuilds every beat from the
transcript, `originalText` included, and there is nothing to restore to
afterwards. A resync says so before it runs.

## 2026-09-20 — the approval gate is gone; the script is used as it comes out

**Decision, the user's:** no `Approve script` step. Whatever the Narrative Script
step produces is what renders. The button, the `Approved` badge, the PATCH route
behind them, the render's 400 and every `script_approved: false` write are
removed; Render Preview now waits only for a script to exist.

**Why it existed:** a render takes twenty minutes, and the approval was there so
nobody discovered an overrun an hour in. The measurement is what actually solved
that — every beat's overrun is a number on the screen before anything is cut — so
the gate was asking for a click to confirm what the page already showed.

**What is left of it:** `movie_recap_projects.script_approved` and
`MovieRecapProject.scriptApproved` still exist and are still read into the mapped
project. Nothing writes them any more and nothing reads the value. Left rather
than dropped because dropping a column is a migration nobody asked for; if this
stays settled, that migration is the tidy-up.

## 2026-09-20 — slot rounding quantizes the BOUNDARIES, not the slots

**Bug, reported by the user as "the speech runs slightly past the footage" even
on beats the script step called a fit.** Every slot was rounded to the frame grid
on its own — `Math.round(value * fps) / fps` — so each shot contributed up to
half a frame of error and a beat's error grew with its shot count. Measured on a
real script: a beat of 49 shots came out 6.567s against 6.690s of speech. The
narration is cut to the picture (`-t slotS`), so the end of that line was clipped.

```
per slot        0.153s of speech truncated, worst beat 0.123s
per boundary    0.033s,                     worst beat 0.013s
```

**Fix:** round the running total and take the difference, so a beat's error is
bounded by one frame however many shots it has. A frame is 0.033s and inaudible;
0.123s takes a syllable.

**Why it hid:** it needs a beat with many shots to show, and beats normally carry
one to three. The 49-shot beat came from a transcript saved with only its first
ten lines, which left the last block owning two minutes of film.

## 2026-09-20 — the ribbon may not move a line more than half a second from its own stamp

**Bug the user watched, not a number on a screen:** beat 4's narration played
over the tail of beat 3's scene. Its window started 0.57s before the timestamp
its words were written against, and further down the same recap two beats sat
2.0s early. The ribbon placed every line purely by speech length; nothing said a
line had to stay near its own moment.

**Decision:** `MOVIE_RECAP_RIBBON_DRIFT_CAP_S = 0.5`. A group's two outer stamps
are still walls; this is what the stamps inside it are worth. The boundary
between two beats split out of ONE block stays free — they share a stamp, so
there is nothing between them to be near.

**Measured on that 45s recap, over the whole range of the choice:**

```
cap 0s      1.93s held frame   drift 0.00s   (stamps as hard walls)
cap 0.5s    0.12s              drift 0.50s
cap 1.0s    0.00s              drift 1.00s
uncapped    0.00s              drift 5.00s   (what shipped)
```

The 5s of drift was never bought with anything: capping it to half a second costs
0.12s of held frame — four frames — across the whole video.

**Why not per-beat slowdown instead**, which the user asked about: with stamps as
walls the same recap needs seven blocks slowed and three sped up, from 0.610x to
1.746x, with 1.639x and 0.610x landing side by side. That is not a timing nudge,
it is slow motion next to fast-forward. The single global speed stands.

## 2026-09-20 — a ribbon boundary takes a film cut when one is within reach

**Decision:** `layoutBlockRibbon` snaps each boundary to the nearest of the
film's own cuts that falls inside the drift cap. If none does, the boundary stays
where speech length put it.

**Why it is free:** the boundary was already allowed to move that far — the cap
is the whole budget — so landing it on a cut gains and loses no footage.
Measured on the 45s recap: 5 of 9 internal boundaries land exactly on a cut, and
the shortfall stays 0.00s.

**What it does NOT fix:** `maxContinuousSourceS` is still only enforced INSIDE a
beat, so two beats playing contiguous source with no cut between them can hold
the picture past the cap.

**How far past, measured properly:** a hold is bounded by the FILM'S OWN longest
take, because our windows cannot hide a cut that is there. On the 45s recap the
film's longest take is 4.63s (4.87s at playback speed) against a 4s cap for 16:9,
the next two are 4.35s and 4.18s, and the median hold is 1.29s across 25 holds.
Nothing reached 5s and nothing could have.

(An earlier measurement here said 6.74s. That was wrong: it did not count a cut
landing exactly on a beat boundary as a break, so it merged two holds. The
corrected figure is above.)

**So there is nothing to fix on this source**, and the options were priced in case
a source with long takes turns up:

- **Punch-in** — split the run at the cap and render the second half at a tighter
  zoom. The content continues, the framing changes, and it costs nothing: same
  footage, same duration. `holdMotionFilter` already zooms, so the filter exists.
- **Skip forward** — costs a held frame, because nine of eleven beats had ZERO
  slack (the ribbon sizes a window to its line). It trades a long hold for a
  frozen one, which is worse.
- **Raise the cap** — 4s for 16:9 is recorded in the constants as reasoned, never
  measured. A median hold of 1.29s is not a slow video.

## 2026-09-20 — the source's own letterbox is cut away before framing

**Bug the user saw:** black bands top and bottom of the render, where the blurred
backfill should have been. `fitMode` was `contain`, which exists to fill exactly
that space, and it did nothing.

**Why:** the film was delivered as 2.39:1 inside a 16:9 file, so its bars are
PIXELS. ffmpeg cannot tell them from picture, the framing step saw 16:9 going
into a 16:9 frame, decided the fit was exact, and the bars rode through.
Measured: a 1280x720 source whose actual picture is 1280x536 at y=92.

**Fix:** the script run samples the source with `cropdetect` at five points and
stores the content rectangle in the analysis blob; `buildShotFilter` cuts to it
FIRST, before framing. Everything downstream then reasons about a 2.39:1 source
and the backfill fills the bars it now knows about. Verified end to end:
`cropdetect` on the rendered sample returns the full frame — no bars left.

**Five samples, loosest wins.** A film that opens on night reads as bars for a
second, so a bar only one sample saw is a dark shot, not a border. The detection
takes the crop every sample agreed on, and returns null — changing nothing —
when the bars are under 8px or nothing could be read at all.

**The rounding trap, which cost a pass:** offsets and dimensions cannot be
rounded the same way. Clamping both to a minimum of 2 turned `x: 0` into `x: 2`
and pushed a full-width crop two pixels off the right edge. A zero OFFSET is
valid; a zero dimension is not.

**A mock render has no analysis**, so it frames the raw file exactly as before.

## 2026-09-20 — the colour grade stops being invisible

**Decision:** `MOVIE_RECAP_LOOK` goes from `1.06 / 1.08 / 0.98` to
`1.12 / 1.18 / 0.96` (contrast / saturation / gamma). Picked off a four-way
comparison rendered from the user's own footage rather than reasoned about.

**Rejected with it, and worth not re-proposing blind:**

- **`unsharp=5:5:0.5`** on top of a stronger grade. It claws back the softness the
  0.95 slowdown and the letterbox crop introduce, and it lifts the source's grain
  with it.
- **Teal-orange** (`saturation 0.85` plus a `colorbalance` pushing shadows blue
  and highlights warm). It is the recap-channel look and moves furthest from the
  source, which is worth something when the footage is someone else's — but it
  was further from the original than the user wanted.

**Also:** the transform test asserted the literal `eq=contrast=1.06:...`, so a
tuned number broke a test that was not about tuning. It reads `MOVIE_RECAP_LOOK`
now and checks that every part of the grade reaches the chain.

## 2026-09-20 — blur is a LIST of areas, not one

**Decision:** `movie_recap_projects.blur_regions` (jsonb) replaces the single
`blur_enabled` + `blur_x/y/width/height`. A source routinely carries a channel
logo, a watermark and a burned-in subtitle at once, and one rectangle cannot
cover three corners. Add and remove areas in the Customize step; drag each in the
preview; an empty list is the off switch, so the toggle is gone.

**The old columns are still there and are no longer read.** The migration copies
what they held into the list, so nobody loses a region they had set. Dropping
them is a separate decision nobody has asked for.

**Capped at 8**, in the route and again on the Add button. Each region is another
split/crop/overlay in the filter graph, and past a handful that is a slower
render for a frame nobody can read anyway.

**Regions may overlap.** Nothing merges or de-duplicates them: a region blurred
twice is simply blurred twice, which is what someone dragging one box over
another asked for.

## 2026-09-21 — narration is the master; footage uses a 3-on/1-off cut at 0.75x (supersedes the 2026-09-20 global-speed and ribbon-fit decisions)

**Decision, confirmed by the user:** the saved narration owns the timeline.
Selected source windows are sampled by retaining 3 source seconds, skipping the
next 1 source second, and repeating. Retained clips play at one global 0.75x.
Each beat trims its last clip to the saved narration boundary. If selected
footage cannot fill that boundary, the planner consumes the nearest unused
relevant scene with the same cadence; only after that pool is exhausted may the
last processed frame be held.

This supersedes the 2026-09-20 decisions that every source second plays as a
continuous ribbon and that the single global picture speed is 0.95. It also
supersedes the wired renderer's selected-footage-then-freeze shortage policy.
Those entries remain above as superseded reasoning, not current behavior.

**Narration caching stays.** Per-beat clips remain content-addressed by voice,
rate and text. The script pass also saves a combined `narration.wav` and its JSON
beat boundaries under a content-derived master key. The master key contains no
video speed or edit-cadence value, so changing picture speed never regenerates
speech. Editing and re-checking one beat synthesizes only that beat, then rebuilds
the combined master from the unchanged cached clips. The old whole-script
fit/re-check UI and transcript overrun warnings are removed; selected scenes are
not relaid to make narration fit.

**One timing function serves preview and render.** `planMovieRecapBeatTimeline`
returns the retained source windows, screen slots, additional-scene usage and
final held gap. Both mock preview and the real render use it, then quantize the
same running clip boundaries to the configured output FPS. Caption chunks are
spread over those exact slots.

**FFmpeg layer order matters.** Each clip is cut with input-side `-ss`/`-t`, its
original audio is removed, the picture is framed/graded/horizontally flipped,
retimed with `setpts=PTS/0.75`, and any final gap is cloned with `tpad` before the
hold-motion zoom. Captions, blur regions and the logo are applied only after all
clips are concatenated, so none of those overlays is mirrored. The cached
narration master is muxed unchanged at 1.0x.

## 2026-09-21 (later) — the narration master plays at 1.05x (supersedes 1.0x above)

**Decision, confirmed by the user:** apply one configurable 1.05x overall rate
while assembling `narration.wav`. This slightly shortens every beat and reduces
the chance that the picture exhausts selected and fallback footage.

The content-addressed TTS clips remain untouched at their provider output speed.
`atempo=1.05` is applied only to the combined master parts, and the timing JSON
is calculated from each sped-up duration before video planning. The master cache
key includes this overall rate, so changing it rebuilds the master WAV and beat
manifest but does not synthesize unchanged beats again. Video remains 0.75x.

## 2026-09-21 (later) — every narration beat has a configured-speed preview

**Decision:** each saved beat in the Narrative Script panel has a play/pause
button. The preview route reads that beat's content-addressed Azure clip, applies
the same `MOVIE_RECAP_NARRATION_PLAYBACK_RATE` and frame-grid duration used by
the master builder, and returns a WAV for browser playback. It does not use the
raw provider speed, so what the user hears beside the line is what the render
will mux.

The browser caches object URLs by beat index plus saved text for the lifetime of
the panel. Unsaved edits disable the button rather than playing audio for the old
text under a new textbox. The preview uses the lightweight typed Spoosh client,
which performs no cache invalidation because it changes no project state. A missing raw beat cache may synthesize that
beat; a normal script already has it, so playback is an R2 read plus ffmpeg only.

**Sequential playback and read-ahead:** pressing any beat starts an autoplay run
from that beat through the saved beats below it. While a beat plays, the next
`MOVIE_RECAP_NARRATION_PRELOAD_BEATS` previews (currently 3) are requested in
parallel through the typed Spoosh client and stored as browser object URLs.
In-flight requests are de-duplicated by beat index plus saved text, so autoplay
can await the same request prefetch already started. Manual pause stops the run.
An unsaved beat also stops it, because silently playing the previously saved
line under edited text would make review untrustworthy.

## 2026-09-21 (later) — beat edits have one action: Re Build this beat

**Decision, by the user:** `Re-check this beat` no longer exists as a product
action. An edited or stale beat offers one primary action labelled exactly
`Re Build this beat`. It saves the text, synthesizes that beat when its raw cache
does not already match, updates its configured-speed duration, and rebuilds the
combined narration master from cached neighbouring beats.

`Save without re-checking` is removed from the UI. A stale beat left by an older
save or a bulk restore also exposes `Re Build this beat`; its playable preview
and sequential autoplay stay disabled until rebuilding completes, so the panel
cannot present old audio as if it belonged to the current line. The legacy
server request shape still accepts `measure: false` for compatibility, but the
current UI never sends it.

## 2026-09-21 (later) — an unsaved beat edit can be cancelled locally

**Decision:** once a beat's textbox differs from its last saved text, the row
shows `Cancel` beside `Re Build this beat`. Cancelling restores only that
textbox to the last server-saved value. It makes no API request and therefore
does not synthesize narration, rebuild the master, or change cached timing.

This is deliberately separate from `Restore original`: restore stages the
script-run's original wording as a new unsaved edit, while cancel discards the
current draft and returns to the most recently saved wording.

## 2026-09-21 (later) — reclaim selected footage and use uniform global rates before borrowing

**Decision, confirmed by the user (supersedes the shortage order above):** an
underfilled beat must not immediately insert an unrelated spare scene. It first
uses the normal 3-source-seconds retained / 1-source-second skipped cadence. If
that is short, it reclaims the skipped seconds from the same selected scenes in
source order. If the full selected spans are still short, the planner resolves
one video speed for the entire recap, from the configured 0.75x default down to
the configured 0.70x safe floor. If more compression is required, it resolves
one narration rate for every beat, from 1.05x up to the configured 1.10x ceiling.

Only after those options are exhausted may a beat borrow footage, and the spare
is ranked by distance from the selected scene boundary so the closest adjacent
scene wins. It is trimmed to the remaining gap. Freeze remains the final
fallback. A scene-specific picture speed or beat-specific narration speed was
explicitly rejected: one render carries one `videoSpeed` and one
`narrationRate`, repeated in its saved beat manifest so rebuilds, inline audio
previews and renders reproduce the same timing.

The resolved narration rate is part of the master WAV cache key. Changing the
rate may therefore rebuild `narration.wav` and its timing JSON from cached raw
beats, but it never re-synthesizes unchanged Azure beat audio. Changing picture
speed alone remains absent from the raw narration cache key.

## 2026-09-21 (later) — video playback is fixed at 0.75x

**Decision, confirmed by the user (supersedes the adaptive 0.75x–0.70x range
above):** every processed clip in every recap plays at the configured fixed
0.75x. Each retained 3 source seconds therefore occupies exactly 4 screen
seconds. The planner must not choose a different picture speed for a beat or tune
one for a particular project's shortage. Reclaiming skipped selected footage,
the single global narration-rate adjustment, adjacent-scene borrowing and the
final freeze fallback keep their existing order.

## 2026-09-21 (later) — narration rate closes only the total shortage

**Decision, confirmed by the user:** with picture fixed at 0.75x, calculate the
single narration rate from the complete recap rather than from its most
underfilled beat. For baseline narration duration `N`, available selected
footage duration `F`, and baseline rate `R`, the rate is `R × N / F` when
`N > F`, capped by the configured narration ceiling. When the narration is two
seconds longer, this removes only that total two-second shortage instead of
letting one short beat over-speed every other beat. All beats still share the
same rate; a beat-local gap proceeds to adjacent footage and then freeze.

## 2026-09-21 (later) — full-source silent timing diagnostic

**Decision, by the user:** Review exposes a separate `Render Silent Timing Test`
action to verify the 3-on/1-off arithmetic without narration or scene selection.
It processes the complete original source continuously, normalizes it to the
configured output FPS, keeps 3 seconds of each 4-second cycle, retimes retained
frames at the fixed 0.75x, removes all audio, and trims the last partial cycle to
the source file's probed duration. Thus each complete 4-second source cycle
becomes 4 output seconds and the complete diagnostic matches source duration.

This is deliberately not the mock recap: it uses no canned beats, captions,
logo, scene selection or narration. It shares the render status/cancel path and
replaces the current preview output so the existing player can inspect it. It
does not read, write or invalidate narration caches.

## 2026-09-21 (later) — footage has one global boundary, not one boundary per beat

**Decision, confirmed by the user (supersedes the per-beat shortage and freeze
parts of the 2026-09-21 timeline decisions above):** narration remains one
continuous master track, and the picture is now planned once against its total
duration. A narration beat no longer forces its own footage to end, borrow, or
freeze. Beat timings remain only for caption placement and for splitting the
already-decided global picture plan into encodable files.

The global plan keeps the saved scene selection first and uses the configured
3-source-seconds retained / 1-source-second skipped cadence at fixed 0.75x. If
that cannot cover the complete narration, it reclaims the selected gaps and
then uses source intervals not selected by any beat, nearest intervals first.
A held frame is permitted only for a shortage that remains after the complete
source is exhausted. Excess picture is trimmed at the single final narration
boundary.

The one narration rate is calculated against the processed full-source
duration, not against any individual beat. A render re-resolves that rate from
the saved beat durations, so an existing project adopts this policy immediately;
when the rate changes it rebuilds only the combined master from cached raw beat
audio and updates the saved timing metadata, without another Azure synthesis.
This deliberately relaxes exact
scene-to-line cut alignment: captions still follow the saved narration beat
timings, but a picture clip may continue through a beat boundary. The accepted
tradeoff is semantic looseness at an individual boundary in exchange for no
early freeze while usable source footage remains.

## 2026-09-21 (later) — rendered MP4 metadata is front-loaded

**Decision:** final recap exports use FFmpeg `-movflags +faststart`, matching the
silent timing diagnostic, and the Review player requests metadata on load. This
moves the MP4 index to the beginning so a browser can start playback through
ordinary R2 byte-range delivery without first downloading the end of the file.
HLS/DASH packaging is intentionally deferred; it is unnecessary for the current
single-file preview and download flow. Existing files keep their old layout and
must be rendered again to gain fast-start playback.

## 2026-09-21 (later) — audio and footage durations are independent

**Decision, confirmed by the user (supersedes duration fitting, global shortage
recovery, final trimming and dynamic narration-rate decisions above):** the
narration master plays at the configured fixed 1.05x without inspecting footage
duration. Selected footage independently applies the configured 3-second keep /
1-second skip cadence and fixed 0.75x playback. There is no borrowing, narration
speed adjustment, narration-boundary trim or footage freeze added to make the
two streams end together.

The final MP4 omits FFmpeg `-shortest`. If picture ends first, narration
continues to its natural end and the player may continue displaying its last
decoded frame; no extra frames are encoded. If narration ends first, picture
continues silently to its own end. Captions remain tied to narration beat
timings, so they follow speech rather than picture cuts. The output duration is
the longer natural stream duration.

## 2026-09-21 (later) — normal render uses the complete source timeline

**Decision, confirmed by the user (supersedes selected-scene picture rendering
above):** normal narration renders process the complete original source with the
same 3-second keep / 1-second skip / fixed 0.75x timing proven by the silent
diagnostic. The last partial cadence window is trimmed so a 45-second source
produces exactly 45 seconds of picture. Scene selection remains saved as script
context but no longer removes footage from the rendered picture timeline.

Narration is muxed independently and cannot shorten that 45-second picture. If
narration is shorter, the remaining full-source picture plays silently; if it is
longer, audio continues after the 45-second video stream ends.

## 2026-09-21 (later) — narration speeds up only when it exceeds the full source

**Decision, confirmed by the user (supersedes the fixed-1.05x part of the
independent-duration decision above):** 1.05x remains the baseline narration
rate. When the measured narration master would be longer than the processed
full-source picture, calculate one uniform rate from every cached raw beat so
the complete narration ends on or just inside the final picture frame. If
narration is already shorter, leave it at 1.05x and let the remaining footage
play silently.

The former 1.10x ceiling does not apply to this fit; the user explicitly allowed
the calculated rate to exceed it. Frame-grid rounding for every beat is included
when finding the minimum sufficient rate. A rate change rebuilds only the cached
master WAV and timing manifest, never unchanged Azure speech clips.

## 2026-09-21 (later) — narration and footage are separate render artifacts

**Decision, by the user:** Review keeps the combined render player and adds a
full-width narration audio player directly below it. Narration WAV and processed
footage MP4 each have their own download action. Footage-only is rendered with
the same transforms, captions, blur and logo as the combined video but without
an audio stream; the combined output stream-copies those exact frames and muxes
the narration, preventing visual drift between the two files.

Artifact URLs and object keys are stored on the project so they survive reloads.
Downloads use an authenticated project route and a short-lived R2 signed redirect
with `Content-Disposition: attachment`; the app server does not proxy large
media bodies. Existing renders gain these controls only after being rendered
again. A silent timing diagnostic exposes its output as footage and has no audio
artifact.

## 2026-09-21 (later) — source replacement keeps the project and resets derived work

**Decision, superseding the rejected source-swap part of 2026-09-19:** Add Source
offers an explicit, confirmed replacement flow. The project id and user-owned
configuration stay: output voice, aspect ratio, fit and zoom, caption styling,
logo, and blur regions. The new file gets a fresh random R2 source key and a new
multipart upload.

Everything whose meaning came from the old movie is cleared before the new upload
can be used: transcript and retelling, narrative beats and approval, narration WAV
and beat-timing cache, analysis, combined/footage/audio render references, render
progress, and the browser-local render history. Old source and derived R2 objects
are deleted; logo objects are deliberately outside that cleanup. An active
transcript, script, or render job blocks replacement until it is cancelled, so an
old job cannot write its result into the newly reset project.

**Why preserve settings:** replacing the source is correction inside the same
project, not a request to recreate the user's presentation choices. Re-seeding
framing from the replacement dimensions would silently discard deliberate edits.
The confirmation names both sides of the boundary before the file picker opens.

## 2026-09-21 (later) — contain preview uses the moving blurred backfill

**Decision:** `contain` always draws a second synchronized copy of the source
behind the fitted foreground video in the Customize preview, for both 9:16 and
16:9. The background copy covers the frame, mirrors and receives the same colour
adjustment as the foreground, and uses a CSS blur converted from the render's
configured FFmpeg box-blur radius and pass count. Captions, logos, and editable
blur regions remain separate DOM overlays and are therefore never mirrored or
folded into the backfill.

**Why:** the render already used moving blurred backfill whenever fit mode was
`contain`, but the preview still showed black bars. That made the configuration
preview disagree with the exported result and made a working render feature look
missing. Ratio changes only the resolution-scaled blur radius; it never gates the
feature.

## 2026-09-21 (later) — render history tolerates older nullable timing fields

**Decision:** every numeric cell in the browser-local render-history table uses
one finite-number formatter and displays an em dash for `null`, missing, or
non-finite values. Older records were written while some timing fields were
nullable, despite the current TypeScript shape treating them as numbers; calling
`toFixed()` directly on those persisted values crashed the whole Review panel.
History is diagnostic data, so an unavailable measurement must degrade to an
empty cell rather than prevent the current render from being viewed.

## 2026-09-21 (later) — source reset follows the current transcript schema

The first source-replacement reset still wrote `transcript_mm`, a legacy column
that the `transcript_story` migration had already dropped. PostgREST rejected the
entire update at schema validation, so the old project remained intact and the
new multipart upload was aborted. The reset now clears only the current
transcript fields; no compatibility write to a removed column is attempted.

## 2026-09-21 (later) — Build Script prepares audio, not picture selection

**Decision, superseding the scene-analysis script flow:** audio and full-source
footage are independent, so Build Script no longer detects cuts, extracts
keyframes, describes scenes, divides text across scenes, or plans selected and
spare footage. One timestamped Transcript story block becomes one narration beat.
The run synthesizes or reuses each beat, resolves one global narration rate,
writes `narration.wav` and its beat timings, and inspects the source only for an
embedded-letterbox crop needed by framing. The saved analysis now contains only
that crop.

**Source replacement is revised with the same boundary:** Transcript fields,
raw narration beat caches, and all Customize Video settings remain. The narrative
script, crop analysis, render artifacts, and browser render history are cleared.
This accepts that retained timestamps may not describe a substantially different
replacement file; the user can edit the retained Transcript before rebuilding.

## 2026-09-21 (later) — scene-group timing resets drift without borrowing footage

**Decision, superseding the independent-duration/no-freeze render rule:** the
narration master remains authoritative, but picture is now fitted per timestamp
scene group. A group is the source interval represented by one Transcript block;
legacy scripts with several beats carrying the same block metadata are grouped
together. The planner applies the configured 3-second keep / 1-second skip cadence
and fixed 0.75x inside that interval only.

The group's target is the sum of its narration beat timings. Picture beyond that
target is trimmed at the group boundary. If it is short, only the last frame from
that same group is frozen for the remaining duration. No footage is borrowed from
another group, and no scene-specific speed is introduced. Cumulative narration
boundaries remain the source of frame quantization, so drift cannot accumulate
across groups. Audio cache, global narration rate, captions, blur, mirror, and
logo behavior remain unchanged.

## 2026-09-21 (later) — beat draft state reports after render

`MovieRecapScript` no longer calls its parent `onDirtyChange` callback while the
child is rendering. Draft-count reporting now runs in an effect and resets on
unmount. The former render-time callback updated `MovieRecapEditor` during a
`MovieRecapScript` render, which React rejects and which surfaced when rebuilding
a beat changed the saved script beneath the editor.

## 2026-09-21 — Narrative Script can rebuild the scene timing plan independently

**Decision:** add `Rebuild Scene Timing Plan` beside `Resync with Main Script` in
the Narrative Script overflow menu. It reads the current saved beats and their
cached narration durations, returns a scene-group summary, and uses the same
pure planner as the renderer. It does not overwrite narrative text, rerun the
Transcript sync, call Azure, or invalidate narration caches.

**Why:** users need to inspect the new scene-group trim/freeze result after
editing beats without the destructive side effect of resyncing every beat from
the main script. Keeping the calculation shared prevents a plan shown in the
editor from disagreeing with Preview or Final Render.

**Consequence:** a beat whose audio is missing or marked stale can still appear
using the speech-duration estimate, but the UI labels the plan as needing
`Re Build` before a measured render is trusted.

## 2026-09-21 — Scene timing plan is collapsed by default

**Decision:** keep the timing-plan result collapsed after rebuilding it; the
header still shows the group count and measured/needs-rebuild status, while the
full scene rows open on demand. This keeps a long Narrative Script from being
dominated by a diagnostic list.

The saved plan is also loaded when the Narrative Script step opens, so the
collapsed header survives a page refresh; expanding it remains an on-demand UI
operation and does not trigger narration or TTS work.

## 2026-09-21 — ribbon groups, not individual beats, are the render walls

**Decision:** narration beats are grouped by the existing configurable
`MOVIE_RECAP_RIBBON_GROUP_S` (currently 25 source seconds), using the saved
`groupIndex/groupStartS/groupEndS` metadata. Older scripts without that metadata
fall back to the same consecutive-block grouping. The 3-second keep / 1-second
skip cadence and fixed 0.75x playback remain unchanged, but trim/freeze happens
only at a group's final boundary.

**Why:** treating every timestamp block as its own scene made a long Burmese
beat freeze at each 3–4 second wall. Those freezes accumulated as apparent
picture drift, then later trims sometimes hid it. Sharing footage inside a
25-second ribbon lets short and long lines balance before one group-level
trim/freeze decision resets the alignment.

**Frame rule:** real render slots now share one cumulative target-FPS frame grid,
and each encoded segment is limited to its exact frame count before concat.
This prevents per-segment `fps` rounding from adding a second, smaller source of
long-run drift.

## 2026-09-21 (later) — one beat is one scene; audio duration is the wall

**Decision, superseding the 25-second ribbon-group decision above:** each saved
narration beat gets its own scene target. The cached, configured-speed audio
duration is the target; its video uses the 3-second keep / 1-second skip cadence
at fixed 0.75x, then trims excess or freezes only that beat's final frame. The
next beat's audio and video both start at the previous beat's cumulative audio
end.

**Why:** a freeze does not create audio/video drift when both streams advance to
the same next-beat boundary. The observed long-run drift is therefore handled at
the actual render boundary: one shared cumulative 30fps frame grid and an exact
frame count per encoded segment. The previous 25-second grouping changed the
picture allocation policy and is no longer the chosen behavior.

## 2026-09-21 (later) — shortage beats may slow to a bounded minimum (SUPERSEDED 2026-10-01 — no floor, no freeze)

**Decision:** keep `0.75x` as the baseline, but when a beat's retained footage
would leave more than the configurable tiny-freeze threshold (`0.15s`), solve a
single speed for that beat. The resolved speed may fall to `0.65x` but never
below it; any remaining shortage at the minimum speed is frozen on that beat's
last frame. A beat with a tiny gap keeps `0.75x` and freezes the tiny remainder.

**Why:** a moderate uniform slow-down across all clips in one beat reads more
naturally than a long held frame, while the lower bound prevents extreme slow
motion. The speed is resolved once per beat, so every clip in that beat remains
consistent. Narration caches and the master audio timeline are unchanged.

The retained-footage planner must not cap screen time to the raw source-window
length. Doing that cancels the extra duration created by `0.75x`/`0.65x`, turns
the intended slow motion into freeze padding, and can leave the final video
track shorter than narration. Only the narration beat target may trim the
resulting screen duration.

The concatenated footage is also checked against the narration-derived final
duration before overlays or upload. A render interrupted by a development
server restart once omitted the final beat but was still marked done; a track
that differs by more than one target frame now fails instead of publishing a
broken file or hiding the missing beat behind a final-frame hold.

Freeze-motion segments must resample the slowed/tpad timeline to the target FPS
before `zoompan`. The hold-motion filter deliberately rebuilds timestamps after
`zoompan`; when resampling happened only afterward, that rebuild erased the
slow-motion timestamps. A three-second source clip planned for 4.1 seconds then
encoded as only 3.1 seconds (raw footage plus freeze). The pre-zoom resample
materializes the slowed frames before the required timestamp reset.

MP4 duration decimals are not used to validate the final timeline. Their tiny
per-segment rounding error grows with segment count even when every frame is
present. The concat is validated by packet/frame count against the
narration-derived target instead, and the overlay pass rebuilds PTS as the frame
sequence `0,1,2...` at 30fps. This makes long and short renders follow the same
exact frame grid; only a genuinely missing frame or beat fails validation.

An encode boundary may still return one frame fewer than requested (measured:
5206 packets for a 5207-frame plan). A configurable repair limit of two frames
allows the overlay pass to clone exactly that many final frames before emitting
the target frame count; the same-size excess is trimmed by the frame cap. A
larger difference still fails, so this repair cannot conceal a missing beat.

## 2026-09-22 — Transcript step links to an external transcript helper

**Decision:** show `youtube-transcript.io` as a prominent, standalone primary
button in the Transcript step. It opens in a new tab and does not send project
data or change the saved transcript flow; users still paste the result into the
existing fields themselves.

The same row also has an `Import` button. Its modal accepts a downloaded plain
text transcript, removes standalone timestamp-only lines and blank lines, then
puts the remaining timestamp-plus-text lines into the editable Source transcript
field. Import is local browser parsing; it does not upload the file or change
the saved project until the Transcript step is saved. The modal's file area also
accepts drag-and-drop and shows a highlighted drop state while a file is dragged
over it; the entire area is also clickable, so no separate file-picker button is
needed.

The Source transcript editor stays open rather than being collapsible and has a
copy button for the Burmese movie-recap translation prompt. It copies the fixed
style/timestamp instructions with the current source transcript inserted under
`SOURCE TEXT`, so the prompt can be pasted directly into an external translation
tool without changing the stored transcript.

When text is pasted into the Burmese story textarea, inline timestamps such as
`00:00 ... 00:03 ...` are automatically split onto separate lines. Existing
line breaks and the rest of the pasted text are preserved, and the formatted
text is inserted at the current cursor selection.

The copied prompt also instructs the translator to use Burmese phonetic spelling
for spoken English acronyms/names when useful (`CIA` → `စီအိုင်အေ`, `Blackbird` →
`ဘလက်ဘဒ်`) and natural spoken forms for quantities (`80,000 feet` → `ပေ
၈သောင်း`). These rules explicitly exclude timestamps and identifiers whose exact
numeric form carries meaning.

## 2026-09-22 — Review keeps only the combined render

**Decision:** remove the Review step's `Render Silent Timing Test` and the
separate narration-audio and processed-footage download controls. Review now
offers the normal mock/real render actions and plays the combined rendered MP4;
the individual artifacts remain internal render implementation details and are
not exposed as user downloads.

**Why:** the silent diagnostic and split asset downloads are no longer part of
the chosen workflow. Keeping them visible suggested alternate outputs that the
user no longer wants to manage.

The earlier prompt rule that removed an adjacent duplicate standalone timestamp
is superseded. The prompt now requires strict one-to-one timestamp preservation,
line-by-line alignment, a line break before every timestamp, and narration text
immediately after every timestamp.

## 2026-09-22 — Review omits the configuration summary for now

**Decision:** remove the Review step's `Review Configuration` heading, helper
text, and repeated settings summary table. Keep the render controls and result
player as the Review step's content.

**Why:** the same settings are already edited and visible in the earlier steps;
repeating the full project summary adds vertical weight without helping the
current render decision.

**Consequence:** Review no longer provides a final read-only configuration
checklist before rendering. Restore a smaller, change-aware summary if the
render flow later needs to explain whether an update is incremental or full.

## 2026-09-22 — Add square (1:1) Movie Recap output

**Decision:** Movie Recap supports `1:1` alongside `9:16` and `16:9`, rendered
at 1080×1080. Square uploads seed to the square output with `cover` framing;
square pacing follows the short-form profile, with its own subtitle size and
edge offset.

**Why:** square is a common social output and should be a first-class format,
not a crop workaround that silently chooses landscape.

**Consequence:** the aspect-ratio database check and every ratio-keyed render,
preview, blur-scaling, subtitle, and pacing table must include `1:1` when
changed. Existing projects keep their current ratio because the new option is
opt-in.

`Contain` with dynamic background blur disabled must pad the fitted source to
the configured output dimensions before zooming. Without that pad, a landscape
source in a 1:1 project encoded as a landscape frame (for example 1080×608), so
the rendered player disagreed with the square preview and overlay sizing.

Square subtitles use 2% of frame height rather than 3.2%. The original square
size read too large against the shorter social frame; preview and render share
this value so both shrink together.

## 2026-09-22 — Place aspect-ratio choices in one row without selection badges

**Decision:** show the three aspect-ratio choices in one row and omit the
selected check badge from those cards. Other choice groups keep their selected
badges.

**Why:** the ratio options are a short, mutually exclusive list; a single row
makes the three formats easy to compare without duplicating the selected state
with both card styling and an icon.

## 2026-09-22 — Dynamic background blur is an explicit option

**Decision:** add `Dynamic background blur` as a separate project setting. It
only affects the moving blurred backfill used behind `contain` framing; the
editable blur regions remain independent. When enabled, preview and render
both use the synchronized moving backfill. When disabled, contain leaves the
letterbox area unfilled.

**Why:** a moving blurred background can make busy or flashing footage tiring
to watch, so users need a clear way to turn that treatment off without
disabling logo/watermark blur regions.

**Consequence:** the setting defaults to enabled to preserve existing project
output. Its value must be included whenever Customize settings are saved, and
preview/render must read the same flag.

## 2026-09-22 — Logo selection is template-only and lives above Customize

**Decision:** move logo controls out of the Customize tab row into a separate
Logo section above the preview and Customize panel. The section uses a
clearable template Select. Selecting a template applies it; clearing removes
the project's logo. Direct logos are not a usable end state: a new logo is
uploaded only as the first step of creating a saved template. Existing
templates can be updated or deleted from the same section.

**Why:** logo identity is a reusable project-level choice, not another set of
per-video controls hidden among framing and subtitle tabs. Requiring a saved
template keeps the selected logo stable and makes reuse explicit.

**Consequence:** legacy projects with a direct logo can temporarily show it so
the user can save it as a template, but saving/continuing now expects the
project to be either template-backed or logo-off.

## 2026-09-22 — Logo template selection is optimistic

**Decision:** selecting or clearing the Logo template updates the Select,
preview metadata, and cached project read immediately. A failed apply/clear
request restores the previous project and selection.

**Why:** template application copies a logo asset and can take long enough for
a Select to feel unresponsive; the user should see the intended choice while
the server finishes the copy.

## 2026-09-22 — Logo returns to Customize and project changes save on Continue

**Decision:** remove the standalone Logo section and restore Logo as a fourth
Customize tab. A project may use a saved template or a one-off logo. Templates
store only their independent logo asset and optional watermark; placement and
opacity belong to the project. The template Select is clearable and shows the
current selection.

Selecting, clearing, uploading a one-off logo, and changing its project settings
only update the browser draft. Save & Continue applies or removes the logo and
saves the complete Customize payload. Template creation and template updates
remain immediate resource mutations, but their responses merge only logo fields
into the draft instead of replacing the complete project.

**Why:** logo choice is part of video customization, and saving it separately
caused API responses to replace unrelated unsaved Customize values. Templates
still need immediate persistence because they are reusable resources of their
own; project configuration does not.

**Supersedes:** `Logo selection is template-only and lives above Customize` and
`Logo template selection is optimistic`. The UI still updates immediately, but
the project mutation is deliberately deferred until Save & Continue.

When a template is selected, its summary card is the single source of logo and
watermark identity. The one-off logo file and watermark inputs are hidden to
avoid duplicate controls; the card shows a labelled watermark value and omits
the asset filename, while placement and opacity remain editable project fields.

## 2026-09-22 — Subtitle tab omits caption visibility controls

**Decision:** remove the Captions switch and burned-in subtitle helper copy from
the Customize UI. Keep the caption style, position, and edge-distance controls.

**Why:** the visibility row and explanatory copy add unnecessary visual weight
to the Subtitle tab. The persisted subtitle setting and render behavior remain
unchanged; this is a UI-only removal.

## 2026-09-22 — Preview logo image follows horizontal placement

**Decision:** align the contained logo image to the selected horizontal corner:
left placements use left object positioning and right placements use right
object positioning.

**Why:** moving the outer logo box to a right corner did not move a narrow
contained image within that box because the image itself remained left-aligned.

**Consequence:** the browser preview now matches the selected corner for logos
that do not fill the entire percentage-based logo box; render geometry is
unchanged.

## 2026-09-22 — Contain is the default and ratio changes preserve zoom

**Decision:** new Movie Recap projects default to `contain` for every source
shape. Source dimensions still seed the matching aspect ratio, but no longer
select `cover`. Existing projects keep their saved fit mode. Changing aspect
ratio preserves the current zoom, including a value explicitly chosen with the
slider; changing fit mode still returns zoom to that mode's recommendation.

**Why:** fresh projects should show the whole source by default, and changing
output shape must not discard a framing choice the user already made.

**Supersedes:** the 2026-09-15 source-framing decision that matching source
orientation defaults to `cover`, the 2026-09-22 square-output decision that a
square upload starts with `cover`, and the 2026-09-16 zoom-seeding rule that an
aspect-ratio change returns zoom to unset. The earlier reasoning remains above
for context.

**Consequence:** the database default and dimension-aware upload seeding both
use `contain`. The `cover` option remains available as an explicit user choice.

## 2026-09-22 — Dynamic blur defaults off and zoom survives framing changes

**Decision:** new Movie Recap projects default dynamic background blur to off.
Existing projects keep their saved value. Once a user chooses a zoom, changing
either aspect ratio or fit mode preserves it. The Aspect panel also omits the
redundant `FIT MODE` label while retaining both fit choices.

**Why:** moving between output shapes and fitting modes must respect the user's
explicit zoom choice, and moving blurred backfill should be opt-in rather than
part of the initial presentation.

**Supersedes:** the earlier 2026-09-22 dynamic-background-blur decision that the
setting defaults enabled, and the later 2026-09-22 framing decision that a fit
mode change returns zoom to its recommendation.

**Consequence:** an untouched nullable zoom may still resolve through the
recommendation mechanism, but neither framing control clears a chosen value.

## 2026-09-22 — Narration voice is chosen with the Burmese story (SUPERSEDED 2026-11-13 — chosen at Narrative Script)

**Decision:** move the Movie Recap voice picker from Customize Video to directly
below the Burmese story in Transcript. Present the two available choices as
`Male` and `Female`, with a preview action for each; the underlying Azure voice
IDs remain unchanged. Transcript Save and Continue persist `voiceProfileId`
alongside the two transcript fields before Narrative Script is entered.

**Why:** the voice determines the narration audio built in the next step, so it
belongs beside the Burmese narration source and before Build Script. Provider
names and descriptions do not help with the choice when the product offers one
male and one female voice.

**Supersedes:** the 2026-09-16 placement decision that offered the two Azure
voices in Settings. The per-beat synthesis, static preview files, internal voice
IDs, and default voice remain unchanged.

## 2026-09-22 — Voice profile names remain visible

**Decision:** the Transcript voice selector displays the intentional profile
names `Thiha` and `Nilar`, not the generic labels `Male` and `Female`. The picker
remains below the Burmese story and continues to save before Narrative Script.

**Why:** the names identify the exact configured voices and are part of the
product's voice-profile identity; gender-only labels discard that distinction.

**Supersedes:** only the `Male`/`Female` presentation choice in the preceding
entry. Placement, persistence, previews, and synthesis behavior are unchanged.

## 2026-09-22 — Remove Customize design templates

**Decision:** remove the Design Template control, its card dialog, its transient
selection state, and the code-defined Facebook Reel preset from Customize Video.
The individual aspect ratio, fit, zoom, and dynamic-blur controls remain.

**Why:** the preset adds another abstraction over settings that are already
direct and editable, without providing enough value to justify the extra UI.

**Supersedes:** both 2026-09-22 design-template decisions: the original local
form preset and its later card-modal presentation.

**Consequence:** removing the control does not alter any project's saved
configuration. Users configure each remaining option directly.

## 2026-09-22 — Hide the single-option output language control

**Decision:** hide Output Language from Customize Video while retaining the
saved `output_language` field, client/server types, and Burmese-only validation.

**Why:** Burmese is currently the only supported output language, so displaying
a selector with no meaningful choice adds unnecessary visual weight.

**Consequence:** existing and new projects continue to save and use Burmese.
The control can return when the product supports another output language.

## 2026-09-23 — Narration uses one fixed 1.234x global rate

**Decision, confirmed by the user:** every real and mock Movie Recap narration
uses a fixed post-synthesis playback rate of `1.234x`. The script and render no
longer compare total narration duration with source duration or derive a faster
rate to make the narration fit. Each beat's final narration duration remains the
timeline wall; its footage trims, slows from the `0.75x` baseline to the `0.65x`
minimum when needed, and freezes its final frame only for any remaining gap.

Azure's `+20%` provider rate remains separate. Content-addressed provider-output
audio stays cached, so changing the fixed global rate later rebuilds the master
without another Azure synthesis. New manifests also retain each beat's raw audio
duration. A single-beat rebuild reuses saved durations for unchanged beats and
loads and processes cached clips with bounded concurrency instead of measuring
and transforming every neighbour serially.

**Supersedes:** the 2026-09-21 decisions that started the master at `1.05x` and
raised one global rate when narration exceeded selected footage or the complete
source. Source duration no longer influences narration speed.

## 2026-09-23 — A beat rebuild splices the current narration master

**Decision, confirmed by the user:** `Re Build this beat` downloads the current
combined narration master and timing manifest, renders only the edited raw beat
at the fixed `1.234x` rate, and replaces that beat's interval. Later beat
boundaries shift by the replacement duration delta; earlier audio and timings
remain unchanged. The result is still one complete narration WAV.

The new content-addressed master and manifest are uploaded before `render_script`
is updated. Only after that write succeeds may the superseded timing manifest
and unreferenced master be removed. A master still referenced by the last final
render is retained until a later render replaces that reference. Missing,
incompatible, or duration-invalid master artifacts fall back to the bounded
parallel full rebuild from raw beat caches.

**Why:** rebuilding one edited beat must not download and reprocess hundreds of
unchanged raw clips. Keeping the full rebuild as recovery preserves correctness
without making it the ordinary path.

## 2026-09-23 — Fixed narration playback eases from 1.234x to 1.2x

**Decision, confirmed by the user:** reduce the post-synthesis global narration
rate slightly, from `1.234x` to a fixed `1.2x`. Azure's separate `+20%` provider
rate and all raw beat cache keys remain unchanged.

**Consequence:** existing raw audio does not need Azure synthesis. The first
master requested at the new rate is rebuilt from cached beats because a master
encoded at `1.234x` cannot be spliced into a `1.2x` timeline; subsequent beat
edits return to the single-beat replacement path.

## 2026-09-23 — Current edits get a dedicated narration-master rebuild

**Decision, confirmed by the user:** the Narrative Script overflow menu exposes
`Rebuild Narration Master`. It calls the existing typed `POST script/recheck`
endpoint, reads only the currently saved beats, and rebuilds their `1.2x` master
and timing manifest from raw caches. It never reads the Transcript story, so it
does not replace user-edited narration. Unsaved textarea drafts must be committed
first.

The separate `Rebuild Scene Timing Plan` menu action is removed. Scene planning
already refreshes automatically when the rebuilt project changes beat durations
or stale state, and final rendering independently runs the same planner. The
collapsible diagnostic result remains visible.

**Supersedes:** the 2026-09-21 choice to keep whole-script recheck out of the UI,
and the later decision to expose manual scene-plan rebuilding beside Resync.
`Resync with Main Script` remains the only action that replaces beat text from
the Transcript story and retains its destructive confirmation.

## 2026-09-23 — Fixed narration playback eases again to 1.15x

**Decision, confirmed by the user:** reduce the post-synthesis global narration
rate from `1.2x` to a fixed `1.15x`. Azure's separate `+20%` provider rate and
raw beat caches remain unchanged. Narrative Script previews, rebuilt masters,
beat timing, and final renders all resolve through the same fixed value.

**Consequence:** an existing `1.2x` master is incompatible with the new timing,
so `Rebuild Narration Master` creates the first `1.15x` master from cached raw
beats without another Azure synthesis. Later edits use single-beat replacement.

## 2026-09-23 — Narration playback drops to 0.8x for an audible test

**Decision, confirmed by the user:** temporarily reduce the fixed
post-synthesis narration rate sharply from `1.15x` to `0.8x` so the slower
result is unmistakable during testing. Preview, master timing, and final render
continue to share this one value. Azure's provider rate and raw caches remain
unchanged.

**Consequence:** existing masters must be rebuilt from cached raw beats before
judging the test. No Azure synthesis is required, and saved narrative edits are
preserved.

## 2026-09-23 — Narration playback returns to 1.2x after the 0.8x test

**Decision, confirmed by the user:** the temporary `0.8x` test rate is replaced
by a fixed post-synthesis narration rate of `1.2x`. Azure's separate `+20%`
provider rate and raw beat caches remain unchanged; preview, master timing, and
final render still share this one value.

**Consequence:** masters built at `0.8x` are incompatible with the new timing,
so `Rebuild Narration Master` must run once to rebuild from cached raw beats. No
Azure synthesis is required.

**Supersedes:** the 2026-09-23 `0.8x` audible-test entry.


## 2026-09-23 — Remove Rebuild Narration Master and `POST script/recheck`

**Decision, confirmed by the user:** the `Rebuild Narration Master` menu action,
its `POST movie-recaps/:id/script/recheck` route, and
`rebuildMovieRecapNarrationMaster` are removed.

**Why:** nothing depends on a manual rebuild. A beat Re Build already produces a
current master — it splices when the rate matches and otherwise rebuilds the
whole master from raw caches. Render calls `ensureNarrationMaster`, whose cache
key includes the rate, so a missing master is built then. Saved beat durations
are rescaled to the fixed rate on read by `normalizeMovieRecapNarrationManifest`,
so the Script step shows correct timing without remeasuring.

**Accepted consequence:** after a rate change with no beat edits, the first
render is slower because it builds the master itself. This is not a bug.

**Supersedes:** "2026-09-23 — Current edits get a dedicated narration-master
rebuild". `Resync with Main Script` remains the only whole-script action.

## 2026-09-23 — 9:16 caption size down: 2.5% -> 2.2%

**Decision, confirmed by the user:** portrait captions read large at 2.5%
(48px at 1080×1920). Now 2.2% (~42px, 3.9% of width). 2.0% was also tried the
same day at 1080×1920 and the user returned to 2.2% — so 2.0% is rejected again
at the current output size, not only at the old 720×1280. Landscape (3.4%) and
square (2%) are unchanged.

## 2026-09-23 — Watermark text is burned into the render

**Decision, confirmed by the user:** the logo tab's watermark text, previously a
preview-only overlay, is now burned into every export as an ASS `Watermark`
style in the same `subtitles.ass` pass (so Burmese watermark text is shaped by
libass, which `drawtext` would not do). Centred, uppercase, white at 30%
opacity, bold, 0.14em letter spacing, drawn under subtitles and the logo. It
appears only while the logo is enabled, matching the preview.

Size is `MOVIE_RECAP_WATERMARK.sizePct` of frame height — 1.5% on 16:9 (~16px
at 1080p), 1.9% on 9:16 and 1:1 — shared by `MovieRecapWatermarkOverlay` and
`buildAss`. 16:9 started at 3.4%, copied from the old fixed 12px preview; the
user found 3.4% and then 2.2% large; 9:16 keeps the 9px-equivalent requested
the same day.

**Supersedes:** "9:16 watermark text is smaller in the preview", which said the
watermark was preview-only and fixed in pixels.

## 2026-09-23 — Beat preview highlights the active beat and floats a player

**Decision, requested by the user:** the beat being previewed gets a
`border-ok` outline and is scrolled to the centre automatically each time
playback reaches it. A fixed bottom-right bar shows its number with play/pause
and scroll-to-top buttons (a manual scroll-to-beat button was replaced by the
auto-scroll). Pause keeps the beat active so play resumes where it stopped; the
bar disappears when sequential playback runs out of playable beats or a preview
fails.

## 2026-09-23 — 16:9 renders at 1920×1080; captions 3.4% -> 3.0%

**Decision, confirmed by the user:** `MOVIE_RECAP_TARGET_DIMENSIONS["16:9"]` is
`[1920, 1080]` (was `[1280, 720]`) and `MOVIE_RECAP_SUBTITLE_SIZE_PCT["16:9"]`
is 3.0 (~32px, was 3.4% / 24px). This is the route the 2026-09-16 caption entry
named for going smaller: the resolution rises first so the smaller relative size
still has enough pixels for stacked Burmese marks.

**Consequences:** ~2.25x the pixels per 16:9 frame, so encodes are slower and
files larger. Percentage-based sizes scale by construction. The two pixel blur
radii scale through the per-ratio `BLUR_REFERENCE_WIDTH` (16:9 stays anchored
at 1280), so the 16:9 backfill blur moves 20 -> 30 and region blur 12 -> 18 —
intended, not drift.

**Supersedes:** "Output stays 1280×720 for now" for 16:9, and the 2026-09-18
note that 16:9 stays at 720p. Do not lower 16:9 captions below 3.4% if the
output ever returns to 720p.

## 2026-09-23 — Source replacement: same video (keep script) or different video

**Decision, confirmed by the user:** `Replace video` is a menu with two items.
**Same video, better quality** (`mode: "same"`) keeps the narrative script,
approval, narration master and current step; it clears the source crop analysis,
render outputs and render history. **Different video** is the previous
behaviour: the script is cleared as well and the project returns to step 1.

**Why:** in practice replacement is mostly swapping in a higher-quality copy of
the same movie. Clearing the script then threw away every beat edit for timing
that was still correct.

**Crop is measured by the render when missing.** The crop is stored in source
pixels, so it cannot survive a resolution change. Instead of asking for a script
rebuild, the render detects it on the downloaded file, saves `analysis.json` and
sets `render_analysis_key`. The render route no longer requires the key — this
is intended, not a missing guard.

**Duration guard:** a "same" replacement whose duration differs by more than
2s asks before keeping the script, because a different cut makes the kept beat
timestamps point at the wrong footage. It is a warning, not a block.

**Supersedes:** the script-clearing part of "2026-09-21 (later) — source
replacement keeps the project and resets derived work" and "Source replacement
is revised with the same boundary" — both now describe only **Different video**.

## 2026-09-23 — Part uploads abort after 60s without progress

**Bug:** an upload sat at 100% forever. R2 had parts 1-3 and 5-6; part 4's retry
PUT had sent every byte (so the bar read 100%) and R2 never answered. The XHR
had no timeout, so the three-attempt retry loop never got a failure to act on.

**Fix:** `uploadPart` aborts when no upload progress arrives for
`PART_STALL_MS` (60s), rejecting as a stall so the retry runs. The timer resets
on each progress event, so slow-but-moving uploads are not cut off.

**Also:** `multipart/complete` no longer writes `current_step: 1`. New projects
already start at 1 and a Different-video replacement sets it itself; resetting it
here sent Same-video replacements back to the first step.

## 2026-09-23 — Part retries: five attempts with backoff, and a failed part stops the rest

**Problem:** stalls kept recurring; all three immediate retries of one part could
stall in a row, stopping the upload. The same presign + PUT pattern from Node
(3 parallel 16 MiB parts) completed every part in 2.6-14s, so R2 itself and the
signing are not the cause; the fault sits on the browser-to-R2 path, still not
identified.

**Change:** `PART_ATTEMPTS` is 5 with exponential backoff (2s, 4s, 8s, 16s)
between attempts, so a wedged connection has time to drop before the retry. A
stall now reports whether every byte was sent (`sentBytes` vs `partBytes` in
`part-attempt-failed`), separating "R2 received it but never answered" from
"sending stopped" for the next diagnosis. When a part exhausts its attempts the
other workers stop taking new parts, instead of uploading on in the background
after the user has been told the upload stopped.

## 2026-09-23 — Mirroring is a per-project toggle, on by default

**Decision, requested by the user:** `movie_recap_projects.mirror_enabled`
(default `true`) with a `Mirror video` switch on the Customize Aspect tab. Off
skips `hflip` in the render and `scaleX(-1)` in the preview; the colour grade is
unaffected. `MOVIE_RECAP_LOOK.mirrorAspectRatios` still gates which ratios can
mirror (currently all three) — the toggle only turns it off per project.

**Why:** mirroring's cost is already recorded — text in the source reads
backwards — and some footage (signs, screens, burned-in subtitles) is worth more
unmirrored. Existing projects keep their mirrored output because the column
defaults on.

## 2026-09-23 — Leaving Transcript or Customize by step tab or Back now saves

**Bug:** Mirror video was off in Customize, yet the render came out mirrored.
Customize edits live in a browser draft that only `Save & Continue` wrote. The
step tabs and Back switched steps without saving, so Review showed the draft
while the render read the saved row (`mirror_enabled` was still true; the row
was only updated 30s after that render finished). Every Customize and
Transcript field was exposed to this, not just mirroring.

**Fix:** `goToStep` saves through `saveAndGo` whenever it leaves step 2 or 4,
for tab clicks and Back alike. The save's validation (project name, logo chosen)
therefore also blocks leaving Customize by tab — intended, since leaving would
otherwise discard the draft.

## 2026-09-23 — Source download uses parallel ranged S3 GETs and reports MB progress

**Decision, requested by the user:** render, script and transcript runs download
the source with `downloadObjectToFile` (`lib/r2.ts`): six parallel 16 MiB ranged
`GetObject` calls over the S3 endpoint, three attempts per range. Render and
script runs report progress as whole MB in their existing progress columns, and
`MovieRecapRenderProgress` shows "Source downloaded X of Y MB" for
`downloading_source`.

**Measured on a 90 MB source:** old `ffmpeg -i <r2.dev URL> -c copy` took 10s;
the new download takes 3.0s. A plain single `fetch` of the r2.dev URL also took
3.0s, so the old cost was ffmpeg's HTTP input, not r2.dev throttling as first
assumed; parallel ranges are kept for larger files.

**Trap:** each range is buffered and written with ONE positional
`FileHandle.write`. Writing every ~16 KB stream chunk at its offset instead made
the same 90 MB take 121s.

**Accepted consequence:** the file is copied byte-for-byte rather than remuxed
by ffmpeg, so it keeps whatever container it was uploaded in; every consumer
opens it with ffmpeg, which probes content rather than the `source.mp4` name.

## 2026-09-24 — Surplus beats speed up to 1.1x before trimming

**Decision, confirmed by the user:** the mirror of the shortage rule. When a
beat's retained footage at 0.75x runs longer than its narration by more than
`MOVIE_RECAP_TINY_FREEZE_S`, the planner solves one speed for the beat, up to
`MOVIE_RECAP_MAX_PLAYBACK_SPEED` (1.1x), and trims only what is still left over.
Before, surplus stayed at 0.75x and the end of the beat's window was cut.

**Why:** the trimmed tail is often the part of the scene that matters (the
payoff or reaction). The cap started at 1.0x and was raised to 1.1x the same
day: 10% over real time does not read as fast-forward, and it sits inside the
0.85-1.15 speed-ramp range accepted earlier. Past ~1.15x it starts to show. The speed is
still resolved once per beat and footage is still never borrowed from another
beat, so the 2026-09-21 no-borrowing rule stands.

**Consequence:** Scene timing plan rows and render logs can now show speeds
above 0.75x; that is this rule, not drift.

## 2026-09-24 — Post-synthesis narration rate 1.2x -> 1.0x (Azure rate only)

**Decision, confirmed by the user:** `MOVIE_RECAP_NARRATION_PLAYBACK_RATE` is
1.0, so narration plays exactly as Azure synthesizes it at `+20%`. The effective
speed drops from ~1.44x to ~1.2x of Azure's default. Azure's rate and raw beat
caches are unchanged, so no speech is re-synthesized.

**Why:** stacking ffmpeg `atempo` on audio Azure has already sped up risks a
processed, echo-like sound; this tests whether the provider's own rate alone
reads well. If it is too slow, the next step considered is raising Azure's rate
(which re-synthesizes every beat) rather than bringing `atempo` back.

**Consequence:** existing 1.2x masters no longer match; the first beat Re Build
or render rebuilds the master from raw caches. Beats get longer, so scene plans
move toward slow-down/freeze rather than trim.

**Supersedes:** "Narration playback returns to 1.2x after the 0.8x test".

## 2026-09-24 — Shortage slow-down floor 0.65x -> 0.60x (SUPERSEDED 2026-10-01 — no floor, no freeze)

**Decision, confirmed by the user:** `MOVIE_RECAP_MIN_PLAYBACK_SPEED` is 0.60.
With per-beat speeds now solved in both directions (0.60x-1.1x), the 0.75x
baseline only applies to sub-0.15s gaps, so this floor — not the baseline —
decides when a beat freezes. Lowering it lets 3s of retained footage stretch to
5.0s instead of 4.62s before any held frame.

**Why now:** the post-synthesis narration rate dropped to 1.0x the same day,
lengthening beats and turning more of them into shortage beats.

**Rejected:** lowering the 0.75x baseline instead. It would contradict the
fixed-baseline decision and barely change freezes, for the reason above.

**Accepted consequence:** at 0.60x, slow motion is closer to visible; the earlier
note that conditional slow-downs past ~0.87x read as deliberate still applies.
Go below 0.60 only after judging a render.

## 2026-09-28 — Reuse Voice Lab profiles in Movie Recap

**Decision:** offer the shared catalog's Wai Yan and Yu Yu VoxCPM2 profiles in
the Transcript voice picker alongside Thiha and Nilar. Preview, script, beat
preview, and render continue to resolve the selected profile through
`lib/tts/`; the profile settings remain defined once in `lib/tts/voices.ts`.

**Why:** the worker now runs on Modal GPU, removing the CPU latency reason for
keeping self-hosted voices out of recaps. Reusing the catalog keeps voice IDs,
provider selection, and voice-design settings consistent between Voice Lab and
Movie Recap.

**Supersedes:** the 2026-09-16 decision to offer only Azure voices and the
2026-09-22 decision that retained only Azure profile IDs.

**Consequence:** an unmigrated project row with `voice_profile_id='narrator'`
now resolves to Wai Yan rather than falling back to Thiha. The earlier Azure
migration rewrites existing rows to `azure-thiha`; unknown voice IDs still fall
back to the default.

## 2026-09-28 — Use reference recordings for Wai Yan and Yuzana narration

**Decision:** VoxCPM2 synthesis for the shared Wai Yan and Yuzana profiles uses
their fixed reference WAV and matching transcript for beat generation.
Reference audio identity and transcript are part of the beat/master cache
fingerprint, so the existing project audio is re-synthesized on its next
narration build instead of reusing voice-design-only clips.

**Why:** the user wants narrative playback in Movie Recap to keep the selected
profile's real reference voice consistent with Voice Lab.

**Consequence:** a project uses the reference for whichever profile is saved in
`voice_profile_id`; selecting another profile still changes the speaker.

## 2026-09-28 — Play supplied voice files as static profile previews

**Decision:** the Wai Yan and Yuzana profile Play buttons serve their supplied
WAV files from `public/movie-recap/voices/` directly. They do not synthesize
the preview line or call the VoxCPM2 worker. New narrative audio still uses
VoxCPM2 with the selected profile's reference WAV and transcript.

**Why:** the user wants the preview button to play the exact supplied recording
and reserve model calls for generating new narration.

**Consequence:** preview playback is immediate and always the original sample;
it does not demonstrate how the model will pronounce arbitrary narrative text.

## 2026-09-28 — Queue beat rebuilds from the Narrative Script step

**Decision:** allow Re Build on another edited beat while one is in progress.
Queued requests run one at a time through Spoosh, with per-beat progress and
drafts for other beats left editable. The active or queued beat cannot be edited
again until its request completes. Resync, bulk restore, and leaving the step
wait for the queue to drain.

**Why:** each rebuild reads and replaces the shared `render_script` row and
narration master. Parallel requests could overwrite another beat's text or
splice against an outdated master. Serializing requests preserves both writes
while letting the user submit the next beat immediately.

**Consequence:** queued beats start generating after earlier requests finish;
their buttons show a queued state during that wait.

## 2026-09-28 — Match Translate's blur-area editing controls

**Decision:** the Movie Recap Customize Blur tab keeps its existing list of up
to eight output-frame percentage rectangles and adds the interaction already
used in Translate: a drag handle to resize the selected rectangle, numeric
X/Y/width/height fields, and deselection outside the preview and blur panel.
Only the selected area shows editing chrome; all areas remain blurred in the
preview and export.

**Why:** the earlier Movie Recap controls moved rectangles on the preview but
required separate width and height sliders, with no numeric position control.
The shared interaction makes covering logos and subtitles more precise.

**Consequence:** blur geometry and render settings are unchanged. The preview
still uses Movie Recap's output frame, which can differ from the source-frame
geometry used by Translate.

## 2026-09-28 — Accept shared voice profiles in project storage

**Decision:** allow `narrator` (Wai Yan) and `narrator-female` (Yuzana) in the
Movie Recap project's voice-profile constraint alongside the two Azure IDs.
Keep the existing default and saved selections.

**Why:** the shared catalog already offered both profiles, but the earlier
Azure-only database constraint rejected them when advancing from Transcript.

**Consequence:** new shared voice selections save successfully; previously
saved Azure selections retain their current voices.

## 2026-09-28 — Allow natural Burmese breaks across adjacent timestamps

**Decision, approved by the user:** the copied translation prompt keeps every
source timestamp and one narration line per timestamp, but may move a dangling
word or phrase into the immediately following line. The event order and beat
timing stay aligned.

**Why:** strictly ending each line at the source boundary can leave a Burmese
subject or connected phrase stranded, making the narration sound unnatural.

**Supersedes:** the 2026-09-22 prompt requirement for exact source-line text
alignment. Timestamp preservation, line count, and text beside every timestamp
remain required.
