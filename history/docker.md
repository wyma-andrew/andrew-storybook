# Docker image

Covers: `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`,
`.dockerignore`, `.env.example`, `next.config.ts`,
`.github/workflows/deploy.yml`, `.github/DEPLOYMENT.md`

## 2026-09-23 — Distributable image, no source needed

**Decision.** One image on Docker Hub that someone else can run with only
`docker-compose.yml` + `.env`. Standalone Next output on `node:22-bookworm-slim`;
ffmpeg, PySceneDetect (venv at `/opt/scenedetect`), Myanmar fonts and the
Supabase CLI + `supabase/migrations` are baked in. `migrate` entrypoint command
runs `supabase db push --db-url`, keeping the "db push only" rule.

**Why.**
- `.env` is excluded from the build context. Next inlines `NEXT_PUBLIC_*` at
  build time when set; left unset, the server bundle keeps
  `process.env.NEXT_PUBLIC_*` and reads it at runtime. There is no browser
  Supabase client (the unused `lib/supabase/client.ts` was deleted 2026-10-28;
  the client reaches data only through Spoosh), so nothing client-side needs the
  value. **If one is ever added, the runtime-env approach breaks** — browser
  bundles would need the value at build time.
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

*Superseded in part by 2026-11-04: Docker is used again, and the Dockerfile runs without standalone.*

## 2026-11-04 — Container on the shared Contabo server

**Decision.** Production moves to a container on the Contabo server that already
runs Executive Homes, using that project's flow: `deploy.yml` builds, pushes to
Docker Hub, and SSH-deploys with compose. The image runs `next start` with
production `node_modules`, not standalone output. It binds `127.0.0.1:3100`,
behind the server's reverse proxy.

**Why.**
- Cloudflare Pages only serves static Next exports. Workers cannot spawn ffmpeg
  (`node:child_process` is a stub) and caps memory at 128 MB, so the video
  features would need another host anyway.
- `next start` avoids the 16.3.4 standalone failure above without changing
  `next.config.ts`, so a Vercel build still works.
- The compose file caps CPU and memory because ffmpeg renders share a host with
  other sites. Exact caps are unmeasured defaults; override them in the server's `.env`.
- Migrations stay out of deploy so a push to `main` cannot change the schema.

**Rejected.** Restoring `output: "standalone"` (blocked by the bug above).
Running `migrate` on every deploy, as Executive Homes does with Prisma.

**Consequences.**
- The image's `FFMPEG_PATH` takes priority, so the `ffmpeg-static` and
  `ffprobe-static` binaries are deleted from it. Both packages must stay
  importable; their reported paths point at missing files. That is deliberate.
- The workflow overwrites `.env.docker` on each deploy. `APP_PORT`, `APP_CPUS`,
  and `APP_MEM_LIMIT` belong in the server's `.env`.
- A deploy recreates the container and kills in-process jobs. Unless
  `RECAP_JOB_RUNNER=github`, a running job's row can stay `running`.
- GitHub reserves the `GITHUB_` secret prefix, so the dispatch token's secret is
  `RECAP_DISPATCH_TOKEN`.

## 2026-11-11 — Quieter deploy logs, one SSH step per stage

**Decision, requested by the user:** after GitHub Actions logs grew too large,
the single "Deploy to VPS" step became five `ssh-action` steps (sync repo,
write `.env.docker`, pull image, restart container, prune images). `git` runs
with `-q`, `docker compose pull` with `--quiet`, `up` with `--quiet-pull`, and
prune output goes to `/dev/null`.

**Why:** a failure now points at the stage that broke, and the noisy progress
output is gone. No `--verbose` flags existed to remove.

**Consequence:** each step opens its own SSH connection. A failed stage stops
the later ones, so a failed pull leaves the old container running. The Docker
build step's log is unchanged.
