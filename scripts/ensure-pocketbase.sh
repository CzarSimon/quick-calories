#!/usr/bin/env bash
# Download the pinned PocketBase binary to ./pocketbase (gitignored) if it is missing or the wrong version.
set -euo pipefail

PB_VERSION="0.40.4" # must match the hosted runtime (backend/README.md)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/pocketbase"

if [[ -x "$BIN" ]] && "$BIN" --version | grep -q "version $PB_VERSION\$"; then
  exit 0
fi

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
echo "Downloading PocketBase ${PB_VERSION} (${os}/${arch})" >&2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/pb.zip" "$url"
unzip -oq "$tmp/pb.zip" pocketbase -d "$tmp"
mv "$tmp/pocketbase" "$BIN"
chmod +x "$BIN"
