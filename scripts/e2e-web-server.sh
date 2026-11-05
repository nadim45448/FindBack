#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3001}"

for file in .env.local .env; do
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
done

if [[ -z "${DATABASE_URL_TEST:-}" ]]; then
  echo "DATABASE_URL_TEST is not set." >&2
  exit 1
fi

export DATABASE_URL="${DATABASE_URL_TEST}"

npx tsx scripts/e2e-prepare.ts

if [[ "${E2E_MANAGE_SERVER:-}" == "1" ]] || [[ -n "${CI:-}" ]]; then
  echo "E2E — stopping other Next.js dev servers in this repo…"
  pkill -f "next dev" 2>/dev/null || true
  sleep 1
fi

echo "E2E — starting Next.js on port ${PORT} (DATABASE_URL_TEST)…"
exec npx next dev -p "$PORT"
