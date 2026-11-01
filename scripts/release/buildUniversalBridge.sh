#!/usr/bin/env bash
# Builds the bridge for Apple silicon and Intel with the release version compiled in, and joins
# both into the universal binary at the path the app's Copy Bridge phase bundles. It signs
# nothing: the Copy Bridge phase signs the bridge with the identity of the app build.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <version X.Y.Z>" >&2
  exit 2
fi
version="$1"
# The bridge parses RELEASE_VERSION by the same rule and refuses to start on anything else.
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  printf 'error: the version %q is not X.Y.Z without leading zeros\n' "$version" >&2
  exit 1
fi

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
universal="$repository/app/build/bridge/magic-free-disk-space-bridge"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for target in arm64 x64; do
  echo "Building the bridge for bun-darwin-$target with RELEASE_VERSION $version"
  bun build "$repository/src/bridgeMain.ts" --compile --target="bun-darwin-$target" \
    --define "RELEASE_VERSION=\"$version\"" --outfile "$work/bridge-$target"
done

mkdir -p "$(dirname "$universal")"
lipo -create "$work/bridge-arm64" "$work/bridge-x64" -output "$universal"
# The Copy Bridge phase refuses a bridge that is not executable.
chmod 0755 "$universal"

archs="$(lipo -archs "$universal")"
echo "The universal bridge $universal holds: $archs"
for arch in arm64 x86_64; do
  if [[ " $archs " != *" $arch "* ]]; then
    echo "error: the universal bridge lacks $arch" >&2
    exit 1
  fi
done
