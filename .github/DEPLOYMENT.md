# Deployment

Single production environment on the shared Contabo server. `deploy.yml` builds
the image, pushes it to Docker Hub, then SSH-deploys with `docker compose`.

| Branch | Workflow | Image | Server path | Host port |
| --- | --- | --- | --- | --- |
| `main` | `deploy.yml` | `waiyandev/ai-storybook-app-prod:latest` | `~/projects/ai-storybook` | `127.0.0.1:3100` |

Set `APP_PORT`, `APP_CPUS`, or `APP_MEM_LIMIT` in the server's
`~/projects/ai-storybook/.env` to change the compose defaults. Do not use
`.env.docker` for these: the workflow overwrites it on every deploy.

## GitHub Actions secrets

| Secret | Notes |
| --- | --- |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | Docker Hub push |
| `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY` | Contabo SSH |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase; read at runtime |
| `OPENAI_API_KEY` / `ADMIN_EMAILS` | |
| `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_BASE_URL` | Cloudflare R2 |
| `TTS_AZURE_KEY` / `TTS_AZURE_REGION` / `TTS_AZURE_ENDPOINT` | Azure Speech; endpoint optional |
| `VOICE_LAB_WORKER_URL` / `VOICE_LAB_WORKER_TOKEN` | Voice Lab worker |
| `VOICE_CALLBACK_BASE_URL` | Public `https://` origin; the worker calls back here |
| `ASR_WORKER_URL` / `ASR_WORKER_TOKEN` | FunASR worker |
| `WHISPER_MM_WORKER_URL` / `WHISPER_MM_WORKER_TOKEN` | Whisper worker |
| `RECAP_JOB_RUNNER` / `RECAP_DISPATCH_TOKEN` | Optional. `github` runs recap script/render on Actions. GitHub reserves the `GITHUB_` secret prefix, so the token maps to `GITHUB_DISPATCH_TOKEN` |

## Pre-flight

1. Make the Docker Hub repository `waiyandev/ai-storybook-app-prod` private
   before the first push if the compiled prompts should not be public. The
   server then needs `docker login` once.
2. Point the domain at the server and add a reverse-proxy site. nginx example:

   ```nginx
   server {
     server_name storybook.example.com;
     client_max_body_size 50m;

     location / {
       proxy_pass http://127.0.0.1:3100;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 3600s;
       proxy_send_timeout 3600s;
     }
   }
   ```

   Storyboard, extraction and render requests stay open for minutes, so the
   proxy's default 60 s timeout would fail them.
3. If the domain is proxied through Cloudflare (orange cloud), its roughly
   100 s origin timeout also applies. Use DNS-only for this host.

## Migrations

Not part of deploy. Push from a dev machine as `AGENTS.md` describes.
