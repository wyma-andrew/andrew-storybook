#!/bin/sh
set -e

case "$1" in
  start)
    exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  migrate)
    : "${DATABASE_URL:?DATABASE_URL is required for migrate}"
    exec supabase db push --workdir /app --db-url "$DATABASE_URL" --yes
    ;;
  *)
    exec "$@"
    ;;
esac
