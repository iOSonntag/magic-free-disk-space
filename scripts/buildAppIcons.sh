#!/usr/bin/env bash
# Makes the app's icon set from one 1024 x 1024 PNG: it writes every size the icon set's
# Contents.json names, as PNG, over the icons in the repository.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <1024 x 1024 png>" >&2
  exit 2
fi
source_image="$1"
if [[ ! -f "$source_image" ]]; then
  echo "error: $source_image does not exist" >&2
  exit 1
fi

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
icon_set="$repository/app/macos/Runner/Assets.xcassets/AppIcon.appiconset"

dimensions="$(sips -g pixelWidth -g pixelHeight "$source_image")"
width="$(awk '/pixelWidth:/ { print $2 }' <<<"$dimensions")"
height="$(awk '/pixelHeight:/ { print $2 }' <<<"$dimensions")"
echo "$source_image is ${width:-?} x ${height:-?} pixels"
if [[ "$width" != "1024" || "$height" != "1024" ]]; then
  echo "error: the icon must be 1024 x 1024 pixels" >&2
  exit 1
fi

for size in 16 32 64 128 256 512 1024; do
  icon="$icon_set/app_icon_$size.png"
  echo "Writing $icon"
  sips -s format png -z "$size" "$size" "$source_image" --out "$icon" >/dev/null
done
