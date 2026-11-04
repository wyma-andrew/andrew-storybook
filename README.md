This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Run unit tests with:

```bash
npm test
```

## Movie Recap assets and R2 CORS

Movie Recap reuses the existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL` configuration.
The bucket CORS policy must allow `PUT` from the app origin, allow the
`Content-Type` header, and expose `ETag`; multipart video uploads cannot be
completed unless browser JavaScript can read each part's ETag.

Place the approved Narrator preview at:

```text
public/movie-recap/voices/narrator.mp3
```

## Self-hosted speech recognition (FunASR on Modal)

Movie Recap transcription and Translate Auto Sync use only the FunASR worker in
`workers/funasr` (Paraformer-zh + VAD + punctuation, character timestamps).
Without `ASR_WORKER_URL`, both fail; there is no OpenAI fallback.

```bash
modal secret create funasr ASR_WORKER_TOKEN=<random token>
modal deploy workers/funasr/modal_app.py
```

Then set `ASR_WORKER_URL` (the printed `FunAsr.transcribe` URL) and the same
`ASR_WORKER_TOKEN` in `.env`. Models download from ModelScope on first use and
are cached in the `funasr-cache` volume.

## Burmese transcription (Whisper large-v3 on Modal)

The Transcript menu uses `workers/whisper-mm` (openai-whisper `large-v3`,
language fixed to Burmese). Without `WHISPER_MM_WORKER_URL` it fails; there is
no OpenAI fallback.

```bash
modal secret create whisper-mm WHISPER_MM_WORKER_TOKEN=<random token>
modal deploy workers/whisper-mm/modal_app.py
```

Then set `WHISPER_MM_WORKER_URL` (the printed `WhisperMyanmar.transcribe` URL)
and the same `WHISPER_MM_WORKER_TOKEN` in `.env`. Weights (~3GB) download on
first use and are cached in the `whisper-mm-cache` volume.

## Movie Recap rendering (ffmpeg with libass)

The render pipeline shells out to ffmpeg, and burning styled Burmese subtitles
into the output needs libass + harfbuzz. Homebrew's plain `ffmpeg` formula no
longer includes them:

```bash
brew install ffmpeg-full   # keg-only, so it is not on PATH
```

Then point the app at it in `.env` (the font must be installed locally;
`Noto Sans Myanmar` ships with macOS):

```bash
FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
MOVIE_RECAP_SUBTITLE_FONT=Noto Sans Myanmar
# The Medium cut, named the way fontconfig finds it (check with
# `fc-match "Noto Sans Myanmar Med"`). One subtitle preset renders at Medium;
# without this the render falls back to Regular and reads lighter than the preview.
MOVIE_RECAP_SUBTITLE_FONT_MEDIUM=Noto Sans Myanmar Med
MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD=Noto Sans Myanmar SemBd
```

Check a build before using it — all three filters must be listed:

```bash
"$FFMPEG_PATH" -filters | grep -E ' (subtitles|ass|drawtext) '
```

The build also needs the Opus encoder, which the audio the render sends to
Whisper is compressed with (uncompressed audio hits Whisper's 25MB upload limit
after about 13 minutes of source):

```bash
"$FFMPEG_PATH" -encoders | grep libopus
```

## Movie Recap jobs on GitHub Actions

The narration build (script) and the final render — full, mock and beat-range —
can run on GitHub Actions instead of inside the Next server
(`lib/recap-job-dispatch.ts`, `.github/workflows/recap-job.yml`,
`scripts/recap-job.ts`). The route claims the row as usual, dispatches the
workflow and returns; the runner installs ffmpeg + the Myanmar fonts, runs the
same pipeline and writes status/progress onto the row, which the wizard
already polls. Cancel works unchanged (the pipeline re-reads the row).

1. Repo → Settings → Secrets and variables → Actions → add these secrets:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`,
   `TTS_AZURE_KEY`, `TTS_AZURE_REGION` (and `TTS_AZURE_ENDPOINT`,
   `VOICE_LAB_WORKER_URL`, `VOICE_LAB_WORKER_TOKEN` if you use them).
2. Create a fine-grained personal access token limited to this repository with
   **Actions: Read and write**.
3. On the app server set `RECAP_JOB_RUNNER=github`,
   `GITHUB_DISPATCH_TOKEN=<token>`, `GITHUB_DISPATCH_REPO=owner/repo` and
   optionally `GITHUB_DISPATCH_REF` (default `main` — the workflow file must be
   on that branch).

A run takes ~30–60s to start. Jobs time out after 300 minutes (GitHub's hard
cap is 6 hours); a killed run marks the row failed with a link to the run.
Public repositories get free Linux minutes; private ones share the account's
monthly quota. The per-shot render log is not sent back to the browser for
these runs — it is in the Actions log. Beat Re Build and beat previews still
run on the app server.

## Movie Recap scene detection (PySceneDetect)

The render pipeline reads the source twice — its audio (Whisper) and its
pictures (one keyframe per detected scene). Scene detection is PySceneDetect,
a Python tool, so it lives in its own virtualenv rather than in `package.json`:

```bash
/usr/bin/python3 -m venv .venv-scenedetect
.venv-scenedetect/bin/pip install "scenedetect[opencv-headless]"
```

`/usr/bin/python3` (Apple's) is deliberate — Homebrew's `python@3.14` currently
fails to load `pyexpat` on macOS 26 (`Symbol not found:
_XML_SetAllocTrackerActivationThreshold`), which breaks pip inside any venv it
creates. Point the app at the CLI in `.env`:

```bash
SCENEDETECT_BIN=/absolute/path/to/.venv-scenedetect/bin/scenedetect
```

Roughly 20x realtime on 1080p (a 2-hour film takes ~6 minutes to scan), so a
full render is minutes of local CPU before any API call happens. The mock
render skips this step entirely.

## Burmese Voice Lab

The authenticated `/labs/voice` page generates short Burmese WAV samples
through a separately running VoxCPM2 worker (local or Modal). It does not persist
text or audio. Configure the Next.js server with:

```dotenv
VOICE_LAB_WORKER_URL=http://127.0.0.1:8808
VOICE_LAB_WORKER_TOKEN=replace-with-a-random-secret
```

Worker setup and GPU notes are in [`workers/voice-lab/README.md`](workers/voice-lab/README.md).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Docker

Production runs as a container on the shared Contabo server; see
[`.github/DEPLOYMENT.md`](.github/DEPLOYMENT.md). The image runs `next start`
with ffmpeg (libass + libopus), PySceneDetect, Noto Sans Myanmar
(Regular/Medium/SemiBold/Bold) and the Supabase CLI with this repo's migrations.
`NEXT_PUBLIC_*` values are read at runtime, not baked into the image.

Build and run locally:

```bash
docker build --target runner -t waiyandev/ai-storybook-app-prod:latest .
```

```bash
docker compose up -d ai-storybook-app-prod
```

The container reads `.env.docker` (from `.env.example`) and listens on
`127.0.0.1:3100`.
