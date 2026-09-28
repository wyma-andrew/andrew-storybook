# Burmese Voice Lab

Covers: `app/(app)/labs/voice/**`, `app/api/labs/voice/**`,
`workers/voice-lab/**`, `lib/voice-lab.ts`, `lib/voice-worker.ts`, and
`lib/tts/**`.

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

**Why `surfaces` instead of two catalogs:** the lab and Movie Recap used to keep
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

**Decision:** set `scaledown_window=20` for the Voice Lab Modal worker.

**Why:** reduce the idle time before the GPU container scales down after a
generation request.

**Rejected:** keeping the previous 60-second window, which kept the GPU warm
longer and could make closely spaced requests faster, but left more idle time
before scale-down.

**Consequence:** a request arriving after the worker scales down must wait for
a cold start. Modal may scale down sooner when over-provisioned.

## 2026-09-28 — Share VoxCPM2 profiles with Movie Recap

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
