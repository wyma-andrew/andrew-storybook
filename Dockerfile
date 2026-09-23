# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No .env is copied in: NEXT_PUBLIC_* must stay unset here so Next does not
# inline one Supabase project into the bundle; they are read at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ARG SUPABASE_CLI_VERSION=2.116.0
ARG NOTO_MYANMAR_VERSION=2.107
ARG TARGETARCH

# Debian's ffmpeg carries libass + harfbuzz + libopus, which the Movie Recap
# render needs for burned Burmese subtitles (see README). Debian's Noto has no
# Medium/SemiBold Myanmar cuts, so those come from the upstream release; their
# fontconfig family names differ from macOS's ("Med"/"SemBd"), hence the ENV.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg fonts-noto-core fontconfig python3 python3-venv ca-certificates curl \
 && python3 -m venv /opt/scenedetect \
 && /opt/scenedetect/bin/pip install --no-cache-dir "scenedetect[opencv-headless]" \
 && curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_linux_${TARGETARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin supabase \
 && curl -fsSL -o /tmp/noto.zip "https://github.com/notofonts/myanmar/releases/download/NotoSansMyanmar-v${NOTO_MYANMAR_VERSION}/NotoSansMyanmar-v${NOTO_MYANMAR_VERSION}.zip" \
 && python3 -m zipfile -e /tmp/noto.zip /tmp/noto \
 && mkdir -p /usr/share/fonts/truetype/noto-myanmar \
 && cp /tmp/noto/NotoSansMyanmar/hinted/ttf/NotoSansMyanmar-Medium.ttf \
       /tmp/noto/NotoSansMyanmar/hinted/ttf/NotoSansMyanmar-SemiBold.ttf \
       /usr/share/fonts/truetype/noto-myanmar/ \
 && rm -rf /tmp/noto /tmp/noto.zip && fc-cache -f \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FFMPEG_PATH=ffmpeg \
    SCENEDETECT_BIN=/opt/scenedetect/bin/scenedetect \
    MOVIE_RECAP_SUBTITLE_FONT="Noto Sans Myanmar" \
    MOVIE_RECAP_SUBTITLE_FONT_MEDIUM="Noto Sans Myanmar Medium" \
    MOVIE_RECAP_SUBTITLE_FONT_SEMIBOLD="Noto Sans Myanmar SemiBold"

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node supabase ./supabase
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
