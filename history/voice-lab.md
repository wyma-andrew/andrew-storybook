# Burmese Voice Lab

Covers: `app/(app)/labs/voice/**`, `app/api/labs/voice/**`,
`workers/voice-lab/**`, `lib/voice-lab.ts`, and `lib/voice-worker.ts`.

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
