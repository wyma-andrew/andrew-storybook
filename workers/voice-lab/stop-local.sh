#!/usr/bin/env bash
pkill -f "uvicorn app:app" && echo "Voice worker stopped." || echo "No voice worker running."
