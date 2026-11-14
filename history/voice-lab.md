# Burmese Voice Lab

Covers: `app/(app)/labs/voice/**`, `app/api/labs/voice/**`,
`components/voice-lab/**`, `components/voice/**`, the `voice_lab_items` / `voice_lab_projects` migrations,
`workers/voice-lab/**`, `lib/voice-lab.ts`, `lib/voice-worker.ts`, and
`lib/tts/**`.

## 2026-11-14 — A failed generate restarts the container

**Decision (approved by the user):** when `/generate` fails, the worker prints
the traceback, puts the exception type in `detail`, and exits its process one
second after it responds (unless the failure was a missing reference file).
Modal then starts a fresh container. The VoxCPM provider now makes 4 attempts,
waiting 2 s, 5 s, then 15 s, so the last attempts can land on the new
container.

**Why:** a movie-recap Resync failed around beat 40 of 58. Every attempt
returned `500` in about 50 ms, with the message `Voice generation failed:` and
nothing after it. The same voice worked minutes later on a new container. The
likely cause is that the container got stuck after a failure, possibly in a
CUDA error state. That has not been confirmed. With `max_containers=1`, all
three retries reached that same container, so retrying alone could not help.

**Consequence:** a real content failure, such as text the model cannot speak,
now costs a cold start (about 80 s) for each failed attempt before the run
reports the failure. The message and the movie-recap log line (which beat, and
its text) now say what failed.

## 2026-11-13 — GPU fallback L40S → L4 → A10G; no warm-up

**Decision, chosen by the user:** the worker's `gpu` is the list `L40S, L4, A10G`.
Modal takes the first one that has capacity. The warm-up from 2026-11-12
(`POST /warmup` pinged during the source download) was removed.

**Why:** the Modal dashboard showed `/warmup` requests enqueued at 21:23 and
21:27 that only started at 21:30. L40S had no capacity for over 6 minutes. That
is far past Modal's 150 s web limit (see the 408 entry below), and also past the
warm-up's 5-minute cap, so warm-up could not hide it. L4 and A10G are slower per
line than L40S but faster than T4, and both support bf16.

**Rejected:** warm-up (built 2026-11-12, then removed the same night). It billed
idle GPU time and still lost to a capacity wait this long. L40S only, which is
the cause of the waits.

**Consequence:** the GPU type can differ between runs, so per-line speed varies.
Output is the same model and seed on any of them, but the numbers may not be
bit-identical across GPU types.

## 2026-11-12 — Narration back to one line at a time

**Decision, chosen by the user:** a Movie Recap script run speaks its lines one
after another again, and the worker's `web` function is back to one container.
`MOVIE_RECAP_NARRATION_CONCURRENCY` and `VOICE_LAB_WEB_MAX_CONTAINERS` are gone.
The L40S GPU stays. This supersedes the "three narration lines at once" part of
the 2026-11-11 L40S entry below.

**Why:** after the switch to three lines at once, a run with Andrew failed with
Modal's 408. Three containers mean three cold starts and more scale-up and
scale-down, so there are more chances for a request to be dropped. L40S alone is
much faster than T4 (about 3–4 s per line, estimated), so sequential narration
is acceptable.

**Rejected:** keeping parallel narration and relying only on the 408/5xx retry.
The retry covers single failures, but the user prefers one predictable container.

**Consequence:** the full-master fallbacks in `lib/movie-recap-narration.ts` and
the beat edit path still call `narrationClip` 6 at a time. On a cache miss those
requests queue at Modal's single container. That was already the case before the
parallel change.

## 2026-11-12 — Retry Modal's 408 like a 5xx

**Decision:** the VoxCPM provider retries a 408 the same way as a 5xx (up to 3
attempts). Other 4xx are still not retried. This replaces "4xx are not retried"
in the 2026-11-11 entry below.

**Why:** a Movie Recap script run with Andrew failed with a bare "Voice worker
returned 408." Modal's `asgi_app` returns 408 when an input never reaches the
container (Modal SDK 1.1.4 changelog), for example after a cancellation or
preemption. This happens more often now that three L40S containers cold-start
at once. The worker was already deployed with the Andrew reference (v14), so the
voice itself was not the cause. One line failing like this ended the whole
script run.

**Rejected:** retrying every 4xx. A 401/422 from the handler is a real request
error and repeating it only wastes GPU time.

**Measured after the 2026-11-12 deploy:** a cold L40S request took about 2.5 min
before the model was loaded, about 2 min of that waiting for a container. That
is past Modal's 150 s web request limit, so Modal answers the POST with a 303.
Node's fetch follows the 303 as a GET to the result URL, and that GET can end in
the 408 (the Modal log showed `GET /generate -> 408`). T4 cold starts (~80 s)
fit inside 150 s, which is why recaps worked before the L40S switch. The retry
lands on the container that is warm by then.

## 2026-11-11 — L40S worker, three narration lines at once

**Superseded in part 2026-11-12:** narration is sequential again and `web` has one
container; L40S stays.

**Decision, chosen by the user:** the Modal worker runs on L40S (was T4) and
its `web` function scales to 3 containers. A Movie Recap script run speaks
`MOVIE_RECAP_NARRATION_CONCURRENCY` (3) lines at once instead of one after
another. `process_job` (Voice Lab batches) stays at one container.

**Why:** measured on T4: ~16 s per 5.6 s line warm, ~80 s cold, so a 700-beat
script took about 3 hours. Modal bills per second, so a faster GPU costs about
the same per run; L40S is estimated at ~3–4 s per line, and three in parallel
should bring a full script to roughly 15–20 minutes (estimate, not measured).

**Rejected:** H100 — about twice L40S's hourly rate for a model this size;
parallelism buys more than a bigger card. Staying on T4 — no native bf16
(VoxCPM2's dtype) and the slowest by far.

**Scaledown 20 s → 30 s (requested by the user):** with three containers and
lines arriving in bursts, 20 idle seconds let containers close between beats and
pay the cold start again; 30 s keeps them warm across short gaps for at most
~10 s more of idle GPU per container.

**Consequences:** each container has its own cold start (~1 min+), paid up to
three times. Keep `MOVIE_RECAP_NARRATION_CONCURRENCY` and the worker's
`VOICE_LAB_WEB_MAX_CONTAINERS` equal — more lines than containers only queue.
Progress writes from parallel lines can land out of order, so the count may
step back briefly. A bare "Voice worker returned 500" (no detail) comes from
Modal, not the handler: Modal logs showed "Container terminated due to
preemption" next to such a 500. The VoxCPM provider therefore retries a 5xx or
dropped connection up to 3 attempts (2 s, then 4 s apart); 4xx, timeouts and
aborts are not retried. Generation is seeded, so a retry is safe.

## 2026-11-11 — Two young narrator reference voices

**Decision, chosen by the user:** samples `young-male-3` and `young-female-4`
from the narrator design experiment become reference profiles `young-male`
("Andrew") and `young-female` ("Yusaku"), listed right after Thiha and Nilar. Each is a 16 kHz
mono PCM copy in `workers/voice-lab/reference_audio/` with its hash and
`referenceText` (`NARRATOR_REFERENCE_TEXT`, the line the sample says). Both are
in the one catalog, so Voice Lab and Movie Recap offer them.

**Why:** the user liked their fluent, connected delivery; a fixed reference
holds the speaker steadier than the design description and seed alone.

Their preview samples were seeded straight into R2 (`voice-previews/`, the
key the preview route computes) from the chosen WAVs, so the picker shows Play
without a GPU run. The Modal worker was redeployed with the two references.

**Consequence:**
`NARRATOR_REFERENCE_TEXT` equals `SAMPLE_TEXT` today but must not follow it —
it is the transcript of the WAV. Display names can change freely (the id is
what is stored).

## 2026-11-11 — Compare movie-recap narrator designs (mid-age and young)

**Decision, requested by the user:** `scripts/try-voice-design.py` gains four
voice-design candidates for cinematic recap narration — `female-1`,
`female-2`, `male-1`, `male-2` (Burmese, around 40), plus `young-female-1/2` and
`young-male-1/2` (around 25–30) — read on the catalog's
`SAMPLE_TEXT` line with the same seed as the earlier experiments. Samples are
written to the gitignored `voice-design-samples/`. Listening feedback: the
young designs paused between words (worst: `young-female-1`); the second young
round (`young-female-3/4`, `young-male-3/4`) drops "pauses" from the
description and asks for fluent, connected speech at a brisk natural pace. As with the 2026-10-11 elder
experiment, they are NOT catalog profiles; a sample the user picks becomes a
fixed reference profile (16 kHz WAV in the worker + hash + `referenceText`).

**Why:** a design description and seed alone drift between lines (2026-10-11);
listening first, then locking a reference, is the path that worked.

## 2026-11-11 — One voice list for every surface

**Decision, requested by the user:** `surfaces` is gone. `VOICES` in
`lib/tts/voices.ts` is the single source of truth; Voice Lab and Movie Recap
offer the same voices (`MOVIE_RECAP_VOICES`, `VOICE_LAB_PROFILES`,
`listVoices`, `getVoice(id, surface)` and `getVoiceLabProfile` were removed;
use `VOICES` / `getVoiceById`). Migration
`20261111110000_movie_recap_voice_check_from_code.sql` dropped the
`movie_recap_projects.voice_profile_id` CHECK, so adding a voice is a code edit
only; `PATCH movie-recaps/:id` validates against the catalog and
`resolveMovieRecapVoice` falls back to the default for unknown values.

**Why:** the two pickers showed different voices, which read as a bug.

**Consequence:** the VoxCPM voices (ပညာရှိအဘိုး, Grandpa, ဓမ္မသံ ၁/၃) can now
narrate a Movie Recap. They run on the Modal GPU, so narration is slower than
Azure and the first beat waits for a cold start.

**Supersedes:** the `surfaces` split from 2026-09-16 and the "lab-only"
availability of the VoxCPM profiles recorded in the 2026-10 entries.

## 2026-11-11 — One shared voice picker for Voice Lab and Movie Recap

**Decision, requested by the user:** the picker lives in
`components/voice/VoicePicker.tsx` and takes the voice list as a prop; the
sample/download/player state is in `components/voice/useVoiceSamples.ts`.
Movie Recap's Transcript step uses it (`MOVIE_RECAP_VOICES`) in place of its
own grid of voice cards and its own preview code.

**Why:** one place for preview, download and selection, so the two surfaces
cannot drift.

## 2026-11-11 — Wai Yan and Yuzana removed

**Decision, requested and confirmed by the user:** the `narrator` (Wai Yan) and
`narrator-female` (Yuzana) profiles are gone from the catalog, both surfaces,
the worker (`REFERENCE_AUDIO`, `reference_audio/*.wav`) and
`public/movie-recap/voices/`. Migration
`20261111100000_remove_waiyan_yuzana_voices.sql` limits
`movie_recap_projects.voice_profile_id` to the two Azure voices and resets the
one Voice Lab project that used Yuzana to the default.

**Consequences:** Movie Recap now offers only Thiha and Nilar. The Modal worker
still has the two WAVs until it is redeployed; nothing asks for them.
`voice_lab_items.voice_id` keeps `narrator*` on old lines as a record of what
generated them.

## 2026-11-11 — Download a sample before playing; one sample line for all voices

**Decision, requested by the user:** in the Voice Lab picker a voice whose
sample is not in storage shows a **Download** button instead of Play. Download
generates it on the GPU and stores it in R2 (the cached preview route), with a
percentage ring on the button; several can run at once and the dialog has
"Download all". Once stored, the button becomes Play. `GET voices/preview`
reports which samples exist (static `previewUrl` or R2).

Every voice now reads the same `SAMPLE_TEXT` (`lib/tts/voices.ts`) so voices
are compared on equal terms. Wai Yan and Yuzana lost their static
`previewUrl` (it played the reference recording, a different sentence), so
they are generated like the other VoxCPM voices. The Azure MP3s already read
this sentence.

**Why:** play silently waited a minute on a cold GPU, which read as broken;
different sample sentences made voices hard to compare.

**Consequence a later reader might "fix":** the percentage is an estimate
(time-based, ~60s VoxCPM / ~5s Azure, held at 95% until done) — the worker
reports no progress. Download state is module-level, so it survives closing
the dialog but not a page reload; a reload during a download shows Download
again until the request finishes and the list is re-read. Movie Recap's voice
picker still generates on play.

## 2026-11-11 — Voice previews are cached in R2

**Decision, requested by the user:** `POST voices/preview` looks in R2 first
(`voice-previews/<voiceId>-<hash>.wav`) and only synthesizes on a miss, then
stores the WAV there. It returns `{ url }` (the R2 public URL) instead of
base64. The hash covers the voice id, `sampleText` and `params`, so changing a
reference, prompt or seed makes a new sample instead of serving the old one.

**Why:** the VoxCPM voices without a static `previewUrl` hit a cold Modal GPU
on almost every press; the old cache lived only in server memory and was lost
on every restart or new Vercel instance.

**Rejected:** moving the voice catalog to the database with samples in
storage — it does not make previews faster, and reference audio is bundled in
the worker, so a DB-added voice would still need a worker change. The 2026-09-16
"one catalog in code" decision stands.

**Consequence:** old samples are not deleted when a voice changes; the
orphaned `voice-previews/` objects are tiny and left in place.

## 2026-11-10 — Voice picker with preview

**Decision, requested by the user:** the editor's voice Select is replaced by
`components/voice/VoicePicker.tsx` (moved 2026-11-11): the chosen voice with a play button
beside it, and a dialog listing every lab voice with its own play button and
a "Use voice" confirm. A backdrop click closes it (changed 2026-11-11 at the user's request; it was blocked at first).
`POST voices/preview` now accepts `voice_lab` as well as `movie_recap`
(`requireFeature` takes a list, any one is enough), so lab-only accounts can
hear samples.

**Why:** there was no way to hear a voice before generating a script with it.

## 2026-11-10 — Lines live in projects

**Decision, requested by the user:** the lab is project-based like Translate
and Transcript. `/labs/voice` lists `voice_lab_projects` (name, voice);
`/labs/voice/[id]` is the former single page scoped to one project. Each
project stores its own voice (`voice_id`), replacing the browser-wide
localStorage choice. Items endpoints moved to
`labs/voice/projects/:id/items`; Generate requires `projectId`. Single-line
edit/delete (`labs/voice/items/:id`) and the worker callback are unchanged.
Migration `20261110150000_voice_lab_projects.sql` moved every existing line
(9, with audio) into one "Untitled" project per owner.

**Why:** separate scripts no longer share one list.

**Rejected:** a ZIP / merged download per project — deferred by the user.

**Consequences:** R2 keys stay `voice-lab/<owner>/…`, not per project;
deleting a project deletes its WAVs by key. The old localStorage voice is not
migrated — the Untitled project starts on the first voice in the catalog.
`voice_lab_items` insert/update RLS also checks the project belongs to the
caller. The migration made `project_id` NOT NULL, so a deploy older than this
change cannot import lines.

## 2026-09-15 — Validate self-hosted narration outside Movie Recap

**Decision:** voice generation is tested on a dedicated authenticated lab page
before it becomes part of the Movie Recap render pipeline. The lab accepts a
short Burmese script, uses one code-defined `narrator` voice-design profile,
and returns a playable/downloadable WAV without database or R2 persistence.

**Why:** model quality, Burmese pronunciation, generation latency, hardware,
and deployment behavior need direct evaluation before generation jobs or recap
schema depend on them. Keeping this path stateless makes repeated experiments
cheap and prevents disposable samples from becoming product data.

The browser calls only the typed Spoosh API. A Next.js route authenticates the
user and proxies to a separately deployed Python VoxCPM2 worker, keeping the
worker URL and optional bearer token server-side. The worker lazy-loads the
model and serializes generation because concurrent inference against one model
instance can exhaust GPU memory.

**Rejected:** browser speech synthesis, because its Burmese voices differ by
device and it cannot reliably provide an audio file for later FFmpeg rendering.
Also rejected for this lab: a prerecorded human/reference voice and saving test
clips, because the requested production experience is one-click generation and
voice cloning rights have not been established.

**Consequence:** the Narrator profile currently uses a fixed English
voice-design instruction and seed rather than a reference recording. It is
repeatable enough for model evaluation but must not be treated as a guaranteed
speaker identity until listening tests confirm stability. The Next app alone
cannot generate audio; the worker and model weights must be available.

## 2026-09-15 — Deploy worker as CPU-only Docker container on personal VPS

**Superseded 2026-09-28** by the Modal entry below; the Docker files were
removed. Kept for the reasoning.

**Decision:** the worker deploys as a standalone Docker container
(`workers/voice-lab/Dockerfile`, `docker-compose.yml`) on a personal VPS with
no GPU, bound to `127.0.0.1:8808` (not exposed publicly). Torch installs from
the CPU wheel index before `voxcpm`, so the image doesn't pull a CUDA build it
can't use. A named volume caches the Hugging Face model download across
container restarts.

**Why:** this is a personal project with a small, known set of users — a
rented/dedicated GPU host is unnecessary cost and operational overhead for
that scale. Containerizing isolates the heavy Python/torch/voxcpm dependency
stack from the Next.js app and makes the worker reproducible on the VPS.

**Rejected:** GPU-backed deploy (own GPU box, or rented spot GPU instance) —
would cut generation latency significantly but adds cost/complexity not
justified by current usage. Can revisit if usage or latency requirements grow.

**Consequence:** CPU inference is slow (VoxCPM2 runs `inference_timesteps=10`
diffusion-style steps per generation with no tensor-core parallelism) — expect
tens of seconds to a couple of minutes per short clip, not the sub-second-per-step
GPU path. This is a throughput/latency cost only: the existing `_model_lock`
already serializes generation, and the Next route's `maxDuration=300` /
10-minute fetch timeout bounds a stuck request without affecting the rest of
the app. Do not read CPU-path timing numbers as representative of eventual
Movie Recap production latency if that later moves to GPU.

## 2026-09-16 — One TTS contract, providers behind it

**Decision:** speech synthesis goes through `lib/tts/`: a `TtsProvider`
interface (`isConfigured()` + `synthesize()`), one voice catalog
(`lib/tts/voices.ts`), a registry, and `synthesize()` as the only entry point
callers use. Providers are `azure` (Azure Speech REST + SSML) and `voxcpm`
(the existing self-hosted worker, now a provider rather than a route's private
transport). The lab route and the Movie Recap render pipeline both call
`synthesize()` and never name a service.

**Why the per-provider params live inside the voice:** a voice-design prompt
and a seed mean nothing to Azure; an SSML rate means nothing to VoxCPM2. `Voice`
is a union discriminated on `providerId`, so a provider's settings are typed
where they belong and adding a third service makes the compiler point at every
place that has to handle it. A voice's `id` — the value in
`movie_recap_projects.voice_profile_id` — stays provider-independent, so moving
a voice to our own service later is an edit in the catalog, not a migration.
This follows the existing rule that presets are code constants, not rows.

**Why `surfaces` instead of two catalogs** *(superseded 2026-11-11 — `surfaces` removed, see top)*: the lab and Movie Recap used to keep
separate voice lists (`VOICE_LAB_PROFILES` and `MOVIE_RECAP_VOICES`) that could
disagree about which voices exist. One catalog with a per-voice `surfaces` list
keeps the picker and the synthesizer in step, and lets the lab offer both Azure
and the self-hosted voices so they can be compared on the same line of text —
which is what the lab is for.

**Rejected:** a provider chosen by env (`TTS_PROVIDER=azure`). The choice is
per-voice, not per-deployment — a user picking "Thiha" is picking Azure — and a
global switch would make a stored voice id ambiguous.

**Consequence:** `lib/voice-lab.ts` is now a thin wrapper over the catalog, and
`app/api/labs/voice/generate` returns `providerId` instead of the worker's
`seed`. `app/api/labs/voice/health` still speaks to the VoxCPM2 worker directly
— it is a worker health check, not a synthesis path, and Azure has no
equivalent.

## 2026-09-28 — Worker on Modal serverless GPU; no health check

**Supersedes** the 2026-09-15 VPS entry, including its "GPU-backed deploy"
rejection, approved by the user. The VPS Docker files (`Dockerfile`,
`docker-compose.yml`, run/stop scripts) were deleted; Modal is the only
deployed path, and `uvicorn app:app` remains for local runs.

**Decision:** `workers/voice-lab/modal_app.py` deploys the unchanged FastAPI
worker to Modal as a scale-to-zero ASGI endpoint, sized to stay inside
Modal's $30/month Starter credit: T4 (cheapest GPU), `min_containers=0`,
`max_containers=1`, `scaledown_window=60` (superseded below), `timeout=300`,
and a Volume caching Hugging Face weights so a cold start does not re-download
the model.
`VOICE_OPTIMIZE=0` there because `torch.compile` warm-up runs on every cold
start and costs more billed seconds than it saves on short lab clips.

**Why:** CPU generation on the VPS took tens of seconds to minutes per clip.
Modal bills per second only while a container is up, so light lab use costs
far less than a rented GPU box — the cost argument behind the original
rejection does not hold for scale-to-zero.

**Health check removed:** the lab page used to call `/health` on load and
disable Generate unless it answered within 5 s. On Modal every request wakes
a GPU container (billed), and a cold start exceeds 5 s, so the check both
burned credit and falsely reported the worker unreachable. The page now calls
generate directly and shows its error.

**Consequence:** the first generation after the scaledown window waits for a cold
start (container + model load). That delay is expected, not a bug. T4 has no
native bf16 (VoxCPM2's checkpoint dtype); if it fails or is very slow,
redeploy with `VOICE_LAB_GPU=L4` rather than raising the other limits.

## 2026-09-28 — Scale the Modal worker down after 20 idle seconds

**Superseded 2026-11-11:** the window is 30 s (see "L40S worker, three narration lines at once").

**Decision:** set `scaledown_window=20` for the Voice Lab Modal worker.

**Why:** reduce the idle time before the GPU container scales down after a
generation request.

**Rejected:** keeping the previous 60-second window, which kept the GPU warm
longer and could make closely spaced requests faster, but left more idle time
before scale-down.

**Consequence:** a request arriving after the worker scales down must wait for
a cold start. Modal may scale down sooner when over-provisioned.

## 2026-09-28 — Share VoxCPM2 profiles with Movie Recap

**Superseded 2026-11-11:** Wai Yan and Yuzana were removed (see top). Kept for the reasoning.

**Decision:** offer the existing Wai Yan and Yu Yu profiles in Movie Recap by
marking them available on both surfaces in the shared TTS catalog.

**Why:** the Modal GPU worker makes these profiles usable by the recap pipeline,
and both products should synthesize the same catalog profile rather than copy
voice settings.

**Rejected:** duplicating the profiles or provider settings in Movie Recap,
which could let the two surfaces drift apart.

**Consequence:** existing projects storing the legacy `narrator` ID now resolve
to the Wai Yan profile; rows migrated to `azure-thiha` remain unchanged.

## 2026-09-28 — Clone the two supplied reference voices

**Superseded 2026-11-11:** Wai Yan and Yuzana were removed (see top). Kept for the reasoning.

**Decision:** use the supplied Wai Yan and Yuzana WAVs as fixed VoxCPM2
reference profiles in both Voice Lab and Movie Recap. The worker receives a
profile ID and its exact transcript, then maps that ID to a WAV bundled under
`workers/voice-lab/reference_audio/`. No arbitrary audio-upload endpoint is
added. The clips are stored as 16 kHz mono PCM, the model's documented
reference input format.

**Why:** the user requested these recordings as the stable voice identities
for the two named profiles. VoxCPM2's reference-audio path plus the matching
transcript provides stronger identity guidance than voice design and a seed.

**Supersedes:** the 2026-09-15 decision to keep reference recordings out of the
lab while cloning rights were unestablished; the user supplied these specific
recordings for the profiles.

**Consequence:** Voice Lab and Movie Recap share the same fixed references.
Changing a reference file requires updating its catalog hash so narration and
preview caches are regenerated.

The second profile is now displayed as **Yuzana** (the catalog ID remains
`narrator-female`, previously displayed as Yu Yu). The supplied reference clips
are short, so identity consistency may be limited even with matching text.

## 2026-09-30 — Persisted line list with async worker jobs

**Supersedes** the "no database or R2 persistence" part of the 2026-09-15
entry. The lab is now a saved list: Import splits pasted text on line breaks
into `voice_lab_items` rows (one per non-empty line, each editable, auto-saved
on blur), and audio is stored in R2 under `voice-lab/<owner>/`. One voice is
chosen for the whole list.

**Decision:** for VoxCPM2 voices, Generate sends every unfinished line to the
worker as ONE job (`POST /jobs`, `202`). The worker renders them one at a time
(the model lock already serializes generation), PUTs each WAV to a presigned R2
URL minted by Next, and reports each finished line to
`POST /api/labs/voice/callback`. The browser polls the list from the database;
it never talks to the worker. Azure voices skip the worker: the route renders
them itself, three at a time.

**Why:** one long request would hit `maxDuration` and Vercel's ~4.5 MB response
limit (audio was base64 in JSON). Presigned uploads keep audio out of the
callback body. Polling the database means a closed tab loses nothing.

**Callback auth:** the worker has no user session, so the callback route is the
one voice-lab route that writes with `supabaseAdmin()`. It trusts a bearer equal
to `VOICE_LAB_WORKER_TOKEN` (already shared with the worker) and only updates a
row still `processing`. Rejected: giving the worker the service-role key;
per-row tokens (skipped for now — internal use; add if users widen).

**Consequences:** callback needs a URL the worker can reach — set
`VOICE_CALLBACK_BASE_URL` (tunnel) for local dev, else the request origin is
used. Batch jobs run in a separate Modal function (`process_job`, spawned by
`web`) so an idle container cannot be scaled down mid-job; that means up to two
GPU containers can exist at once. A worker that dies leaves rows `processing`;
Generate re-picks those after 30 minutes. Editing a line resets it to pending
and deletes its audio. A callback that never arrives is not retried by Next.

**Addendum 2026-09-30 — R2 reconciliation:** `GET /api/labs/voice/items` also
marks a `processing` row `done` when its `audio_key` object already exists in
R2 (duration read from the WAV header). The callback stays the only way a
worker *failure* is reported; this only recovers lost success callbacks (local
dev with no tunnel, network drops). Rejected: dropping the callback — R2 alone
cannot tell "still rendering" from "worker died".

## 2026-09-30 — Never prepend a style prefix to the spoken text

**Decision:** the worker sends the model exactly the text it was given. It no
longer prepends `(stylePrompt)` in any case; with a reference recording the
model read the English prefix aloud ("a calm cinematic narrator…").

**Consequence:** `stylePrompt` is still required by the request and catalog but
is unused. Movie Recap narration shares this path, so audio cached before this
fix may contain the spoken prefix; regenerate it.

## 2026-10-11 — Test VoxCPM2 voice design for Buddha-story narration

**Approved exception to the 2026-09-30 no-prefix decision:** add the
Voice Lab-only `ဓမ္မသံ` profile with no reference recording. On this path only,
the Next server sends VoxCPM2 a parenthesized voice-design description before
the Burmese line, as the model's documented voice-design interface requires.
The worker continues to pass its input verbatim, so its current deployment can
serve the new profile. Keep the existing Wai Yan and Yuzana reference-cloning
paths free of the description so their narration cannot start reading it again.

**Why:** the user wants a distinct, calm and steady narration voice from the
same self-hosted model used for Wai Yan and Yuzana, rather than Azure Thiha.
Start with one fixed seed for repeatable experiments; change the seed only if
listening shows the initial voice is unsuitable.

**Rejected:** an Azure Thiha variant, because it uses a different service and
speaker. Reusing either existing reference recording would retain that
speaker's identity instead of exploring a new voice.

**Consequence:** VoxCPM2 may still speak the English description aloud or vary
the voice between lines. Listen to generated samples before using this profile
for production narrative; a selected reference clip may be needed to lock its
identity later.

**Listening feedback:** the first sample did not sound grave enough. Strengthen
the voice description toward a mature, resonant baritone with solemn, deliberate
delivery. Keep the seed fixed while testing the description so the effect of the
prompt change can be judged separately from random variation.

**Further listening feedback:** the user preferred the fuller timbre from seed
`20261011` but the phrasing from `20261012`. Keep the fuller seed and describe
fluent phrasing and graceful pauses instead of deliberate pacing. Treat this as
a candidate until the combined sample is heard; seed alone does not lock a
speaker identity across arbitrary text.

## 2026-10-11 — Lock the selected Dhamma samples as reference voices

**Supersedes** the unreferenced `ဓမ္မသံ` voice-design profile above. The user
selected generated samples 1 and 3 as two voices for Voice Lab and asked for
the same reference-audio path used by Wai Yan and Yuzana to improve identity
consistency across narration lines.

**Decision:** store both selected samples as 16 kHz mono PCM WAVs in the worker,
with distinct `ဓမ္မသံ ၁` and `ဓမ္မသံ ၃` catalog IDs. Each profile supplies its
reference ID, file hash, and the exact Burmese source line as `referenceText`.
The worker uses both the reference WAV and transcript for VoxCPM2's cloning
path. Do not prepend the experimental English voice-design description to new
spoken lines.

**Why:** seed and natural-language voice design did not keep the desired timbre
and delivery together across candidates. Fixed audio examples give the model a
concrete speaker identity, while retaining both user-selected alternatives for
later listening tests.

**Rejected:** continuing to tune one unreferenced profile by seed alone; its
voice can drift between lines. Also rejected: merging the two examples into one
reference clip, because they represent distinct candidate voices and a stitched
reference would not match a single uninterrupted transcript.

**Consequence:** the Modal worker must be redeployed with the two new WAVs and
reference IDs before these options can generate audio. The clips are short,
so consistency still needs testing on lines other than the reference sentence.
The lab maps a browser's stored `dhamma-narrator` selection to `dhamma-1` so
the retired experiment does not silently fall back to Azure Thiha.

## 2026-10-11 — Preserve jobs across a cold-start dispatch timeout

**Decision:** allow up to four minutes for the Modal `/jobs` request to be
accepted, within the route's five-minute limit. If that wait still times out,
return the rows as processing because acceptance is uncertain. Polling can
recover an uploaded WAV from R2 even when an earlier timeout marked its row
failed; a processing row with no audio becomes failed after 30 minutes.

**Why:** a Voice Lab Generate request returned 502 after 62 seconds, matching
the route's former 60-second fetch timeout, while Modal logs showed `/jobs`
accepted around that time. Immediately marking the row failed can discard a
worker result whose acceptance response was simply late.

**Rejected:** retrying `/jobs` automatically after a timeout, which can launch
the same batch twice. Also rejected: treating the timeout as definite failure,
because the worker may already be processing it.

**Consequence:** a truly lost request can remain processing until the existing
30-minute stale threshold. The browser can keep polling instead of showing a
misleading 502 or starting a duplicate job.

## 2026-10-11 — Compare three elderly Burmese voice designs manually

**Decision:** provide a local command for three distinct VoxCPM2 voice-design
descriptions, each using the same Burmese sentence and seed. The command calls
the worker's direct `/generate` endpoint and saves one WAV only when the user
runs it. These are experiments, not catalog profiles.

**Why:** Voice Lab only offers fixed reference voices, while the user wants to
listen to an older, slower storyteller before choosing a new stable reference.
Keeping the text and seed fixed makes the three descriptions easier to compare.

**Rejected:** adding unreferenced candidates to the Voice Lab selector before
listening, because they would look like stable narration profiles despite the
previously observed voice drift. A selected sample can later become a fixed
reference profile.

## 2026-10-11 — Save the selected elder storyteller as a reference profile

**Decision:** the user selected voice-design sample 2. Add `ပညာရှိအဘိုး` as a
Voice Lab-only VoxCPM2 profile using that sample converted to 16 kHz mono PCM,
its matching Burmese source sentence, and a fixed reference hash. The worker
receives the new `wise-elder` reference ID; subsequent narration lines contain
only the requested Burmese text.

**Why:** the user liked this speaker and wants to reuse it consistently. The
recording anchors the model to the selected voice more closely than a design
description and seed alone.

**Rejected:** exposing sample 2 as an unreferenced profile, because its voice
could change across narration lines. The original 48 kHz experiment remains a
manual listening sample; the worker uses a converted 16 kHz copy.

## 2026-10-25 — Add the supplied Grandpa reference profile

**Decision:** add `grandpa` as a Voice Lab-only VoxCPM2 reference profile from
the user-supplied old-man storytelling clip (converted from 48 kHz stereo MP3 to
16 kHz mono PCM), with its exact Burmese transcript as `referenceText`.

**Why:** the user wants a warm grandfather-to-grandchild storyteller voice; a
fixed reference anchors identity better than voice design and seed.

**Consequence:** the Modal worker must be redeployed with `grandpa.wav` before
this profile can generate audio. Consistency on other lines still needs
listening tests.

The reference was replaced the same day with the user's noise-reduced version
of the clip (same transcript), converted the same way; the catalog hash
changed with it.

## 2026-10-25 — Regenerate all lines

**Decision:** Voice Lab has a confirmed "Regenerate all" action that sends
every line's ID to the existing generate route with the selected voice, so
finished lines are re-rendered too (Generate still only picks unfinished ones).

**Why:** comparing a new or changed voice profile on an already generated
script otherwise needs one click per line.

**Consequence:** old audio is replaced as each line finishes; there is no undo.
