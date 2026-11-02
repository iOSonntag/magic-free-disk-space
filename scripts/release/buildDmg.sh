#!/usr/bin/env bash
# Packages the app into a compressed disk image that shows the app beside a link to Applications,
# and signs the image with the given identity and a secure timestamp.
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <app path> <dmg path> <signing identity>" >&2
  exit 2
fi
app="$1"
dmg="$2"
identity="$3"
if [[ ! -f "$app/Contents/Info.plist" ]]; then
  echo "error: $app is no app bundle" >&2
  exit 1
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT

echo "Staging $app with a link to /Applications"
ditto "$app" "$staging/$(basename "$app")"
ln -s /Applications "$staging/Applications"

mkdir -p "$(dirname "$dmg")"
# hdiutil create sometimes fails with "Resource busy" on a fresh runner; a retry clears it.
for attempt in 1 2 3; do
  echo "Creating $dmg (attempt $attempt)"
  if hdiutil create -volname "Magic Free Disk Space" -srcfolder "$staging" -fs HFS+ \
    -format UDZO -ov "$dmg"; then
    break
  fi
  if [[ $attempt -eq 3 ]]; then
    echo "error: hdiutil could not create $dmg" >&2
    exit 1
  fi
  sleep 10
done

echo "Signing $dmg"
codesign --sign "$identity" --timestamp "$dmg"
codesign --verify --strict --verbose=2 "$dmg"
