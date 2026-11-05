#!/usr/bin/env bash
# Download a pinned PocketBase binary (if needed) and serve it locally with this repo's migrations.
# Usage: ./scripts/dev.sh [extra pocketbase args]   (run from the pocketbase/ directory or anywhere)
set -euo pipefail

PB_VERSION="${PB_VERSION:-0.40.6}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT/bin"
BIN="$BIN_DIR/pocketbase"

if [[ ! -x "$BIN" ]] || ! "$BIN" --version | grep -q "$PB_VERSION"; then
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=amd64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip"
  echo "Downloading PocketBase ${PB_VERSION} (${os}/${arch})"
  mkdir -p "$BIN_DIR"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/pb.zip" "$url"
  unzip -oq "$tmp/pb.zip" pocketbase -d "$BIN_DIR"
  rm -rf "$tmp"
fi

exec "$BIN" serve --dir "$ROOT/pb_data" --migrationsDir "$ROOT/pb_migrations" "$@"
