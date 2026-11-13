#!/usr/bin/env bash
# Serve a local PocketBase (0.40.4) with this repo's migrations and hooks.
# Usage: scripts/dev-backend.sh [extra pocketbase serve args, e.g. --http=0.0.0.0:8090]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/ensure-pocketbase.sh"
mkdir -p "$ROOT/.local/pb_data" "$ROOT/backend/pb_hooks"

http="--http=127.0.0.1:8090"
for arg in "$@"; do [[ "$arg" == --http=* ]] && http=""; done

exec "$ROOT/pocketbase" serve $http \
  --dir="$ROOT/.local/pb_data" \
  --migrationsDir="$ROOT/backend/pb_migrations" \
  --hooksDir="$ROOT/backend/pb_hooks" \
  "$@"
