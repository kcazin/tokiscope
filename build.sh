#!/bin/sh
# Builds "Tokiscope.app" into build/, with the pages in lab/ and agent-stats inside it. Needs only the Xcode command
# line tools.
#   ./build.sh && open "build/Tokiscope.app"
# agent-stats is the release agent-stats.pin names, downloaded once into build/cache and checked against the pin.
# AGENT_STATS_BIN=<path> ships that binary instead (a local build: cargo build --release in an agent-stats checkout).
# Try a local copy of the pages first:  python3 -m http.server 8765, then Load From > Local Copy in the menu.
set -e
cd "$(dirname "$0")"
APP="build/Tokiscope.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Helpers" "$APP/Contents/Library/LaunchAgents"
swiftc -O -parse-as-library -o "$APP/Contents/MacOS/Tokiscope" Tokiscope.swift
cp Info.plist "$APP/Contents/"
cp -R lab "$APP/Contents/Resources/"
cp agents/*.plist "$APP/Contents/Library/LaunchAgents/"

pin() { sed -n "s/^$1=//p" agent-stats.pin; }
if [ -n "${AGENT_STATS_BIN:-}" ]; then
  cp "$AGENT_STATS_BIN" "$APP/Contents/Helpers/agent-stats"
else
  V=$(pin version) CACHE="build/cache/agent-stats-$V"
  mkdir -p "$CACHE"
  for T in aarch64-apple-darwin x86_64-apple-darwin; do
    SUM=$(pin "$T") TAR="$CACHE/agent-stats-$V-$T.tar.gz"
    [ -n "$SUM" ] || { echo "agent-stats.pin has no SHA256 for $T (set AGENT_STATS_BIN to build with a local agent-stats)" >&2; exit 1; }
    [ -f "$TAR" ] || curl -fsSL -o "$TAR" "https://github.com/kcazin/agent-stats/releases/download/v$V/agent-stats-$V-$T.tar.gz"
    echo "$SUM  $TAR" | shasum -a 256 -c -s || { rm -f "$TAR"; echo "$TAR does not match agent-stats.pin" >&2; exit 1; }
    mkdir -p "$CACHE/$T" && tar -xzf "$TAR" -C "$CACHE/$T" agent-stats
  done
  lipo -create -output "$APP/Contents/Helpers/agent-stats" "$CACHE/aarch64-apple-darwin/agent-stats" "$CACHE/x86_64-apple-darwin/agent-stats"
fi
chmod 755 "$APP/Contents/Helpers/agent-stats"

# The helper first: the app's signature covers it.
codesign --force --sign - --identifier com.kilcazn.tokiscope.agent-stats "$APP/Contents/Helpers/agent-stats"
codesign --force --sign - "$APP"
echo "Built $APP with $("$APP/Contents/Helpers/agent-stats" version)"
