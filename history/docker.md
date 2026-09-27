# Docker image

Covers: `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`,
`.dockerignore`, `.env.example`, `next.config.ts` (`output: "standalone"`)

## 2026-09-23 — Distributable image, no source needed

**Decision.** One image on Docker Hub that someone else can run with only
`docker-compose.yml` + `.env`. Standalone Next output on `node:22-bookworm-slim`;
ffmpeg, PySceneDetect (venv at `/opt/scenedetect`), Myanmar fonts and the
Supabase CLI + `supabase/migrations` are baked in. `migrate` entrypoint command
runs `supabase db push --db-url`, keeping the "db push only" rule.

**Why.**
- `.env` is excluded from the build context. Next inlines `NEXT_PUBLIC_*` at
  build time when set; left unset, the server bundle keeps
  `process.env.NEXT_PUBLIC_*` and reads it at runtime. The browser Supabase
  client (`lib/supabase/client.ts`) is currently unused, so nothing client-side
  needs the value. **If it becomes used, the runtime-env approach breaks** —
  browser bundles would need the value at build time.
- Debian's `ffmpeg` already has libass/harfbuzz/libopus; no custom build.
- Debian's `fonts-noto-core` ships only Regular/Bold Myanmar. Medium/SemiBold
  come from the notofonts release. Their fontconfig family names on Linux are
  `Noto Sans Myanmar Medium`/`SemiBold`, not macOS's `Med`/`SemBd`, so the image
  sets `MOVIE_RECAP_SUBTITLE_FONT_MEDIUM`/`_SEMIBOLD`. A `.env` that blanks
  these (or `SCENEDETECT_BIN`) overrides the image defaults — `.env.example`
  leaves them out for that reason.

**Not included.** `workers/voice-lab` (GPU worker) stays separate; point
`VOICE_LAB_WORKER_URL` at it if used.

## 2026-09-27 — Deployment moved to Vercel; standalone output removed

**Decision:** `next.config.ts` no longer sets `output: "standalone"`. The app deploys to Vercel; Docker is no longer used.

**Why:** Standalone only existed for the Docker image. With Turbopack, Next 16.3.4 does not write `.next/next-server.js.nft.json`, but the standalone step on Vercel reads it and the build fails with ENOENT (vercel/next.js#96646).

**Consequence:** The Dockerfile no longer builds a runnable image (it copies `.next/standalone`). Restore `output: "standalone"` before using it again, on a Next release with the fix (reported fixed in 16.3.5+).
