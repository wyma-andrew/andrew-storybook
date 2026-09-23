#!/bin/sh
set -e

case "$1" in
  start)
    exec node server.js
    ;;
  migrate)
    : "${DATABASE_URL:?DATABASE_URL is required for migrate}"
    exec supabase db push --workdir /app --db-url "$DATABASE_URL" --yes
    ;;
  *)
    exec "$@"
    ;;
esac
