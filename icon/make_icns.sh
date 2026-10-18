#!/bin/sh
# Makes icon/AppIcon.icns from one concept of make_icon.py (default: scope), every size macOS asks for.
#   icon/make_icns.sh [concept]
set -e
cd "$(dirname "$0")/.."
SET=$(mktemp -d)/AppIcon.iconset && mkdir -p "$SET"
python3 icon/make_icon.py "${1:-scope}" "$SET/full.png" >/dev/null
for s in 16 32 128 256 512; do
  sips -z $s $s "$SET/full.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$SET/full.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
rm "$SET/full.png"
iconutil -c icns -o icon/AppIcon.icns "$SET"
rm -rf "$(dirname "$SET")"
echo "icon/AppIcon.icns from ${1:-scope}"
