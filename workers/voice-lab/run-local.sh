#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
set -a
source ../../.env
set +a
VOICE_DEVICE="${VOICE_DEVICE:-cpu}" nohup uvicorn app:app --host 127.0.0.1 --port 8808 > /tmp/voice-worker.log 2>&1 &
disown
echo "Voice worker started (pid $!). Logs: tail -f /tmp/voice-worker.log"
