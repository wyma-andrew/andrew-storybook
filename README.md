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
through a separately running, self-hosted VoxCPM2 worker. It does not persist
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

The image bundles the standalone Next server, ffmpeg (libass + libopus),
PySceneDetect, Noto Sans Myanmar (Regular/Medium/SemiBold/Bold) and the
Supabase CLI with this repo's migrations, so it runs without the source.

Build and push (multi-arch, so it runs on Intel and Apple Silicon hosts):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <dockerhub-user>/ai-storybook:latest --push .
```

On the host that runs it, only `docker-compose.yml` and a filled-in `.env`
(from `.env.example`) are needed:

```bash
docker compose run --rm migrate
docker compose up -d
```

`migrate` runs `supabase db push` against `DATABASE_URL`. Set `IMAGE` in `.env`
to the pushed tag. `NEXT_PUBLIC_*` values are read at runtime, not baked into
the image, so one image serves any Supabase project.
