#!/bin/sh
# Builds "Tokiscope.app" into build/, with the pages in lab/, agent-stats and Sparkle inside it. Needs only the Xcode
# command line tools.
#   ./build.sh && open "build/Tokiscope.app"
# agent-stats is the release agent-stats.pin names, downloaded once into build/cache and checked against the pin.
# AGENT_STATS_BIN=<path> ships that binary instead (a local build: cargo build --release in an agent-stats checkout).
# Sparkle (updates) is the release below, checked the same way.
# A release (dist.sh does this): TOKISCOPE_VERSION=1.2.3 sets the version and the update feed, SIGN_IDENTITY="Developer
# ID Application: …" signs with that certificate and the hardened runtime. Otherwise the app is signed ad hoc and
# never updates itself.
# Try a local copy of the pages first:  python3 -m http.server 8765, then Load From > Local Copy in the menu.
set -e
cd "$(dirname "$0")"
SPARKLE=2.10.0 SPARKLE_SHA256=c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c
FEED=https://github.com/kcazin/tokiscope/releases/latest/download/appcast.xml
APP="build/Tokiscope.app" C="build/Tokiscope.app/Contents"

# Sparkle, to link against and to ship.
SP="build/cache/sparkle-$SPARKLE" SPTAR="build/cache/Sparkle-$SPARKLE.tar.xz"
if [ ! -d "$SP/Sparkle.framework" ]; then
  mkdir -p build/cache
  [ -f "$SPTAR" ] || curl -fsSL -o "$SPTAR" "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE/Sparkle-$SPARKLE.tar.xz"
  echo "$SPARKLE_SHA256  $SPTAR" | shasum -a 256 -c -s || { rm -f "$SPTAR"; echo "$SPTAR does not match its SHA256" >&2; exit 1; }
  rm -rf "$SP" && mkdir -p "$SP" && tar -xf "$SPTAR" -C "$SP"
fi

rm -rf "$APP"
mkdir -p "$C/MacOS" "$C/Resources" "$C/Helpers" "$C/Library/LaunchAgents" "$C/Frameworks"
swiftc -O -parse-as-library -F "$SP" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
  -target "$(uname -m)-apple-macos13.0" -o "$C/MacOS/Tokiscope-$(uname -m)" Tokiscope.swift
# Universal: the other architecture too.
OTHER=$([ "$(uname -m)" = arm64 ] && echo x86_64 || echo arm64)
swiftc -O -parse-as-library -F "$SP" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
  -target "$OTHER-apple-macos13.0" -o "$C/MacOS/Tokiscope-$OTHER" Tokiscope.swift
lipo -create -output "$C/MacOS/Tokiscope" "$C/MacOS/Tokiscope-arm64" "$C/MacOS/Tokiscope-x86_64"
rm "$C/MacOS/Tokiscope-arm64" "$C/MacOS/Tokiscope-x86_64"
cp Info.plist "$C/"
if [ -n "${TOKISCOPE_VERSION:-}" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $TOKISCOPE_VERSION" -c "Set :CFBundleVersion $TOKISCOPE_VERSION" \
    -c "Add :SUFeedURL string $FEED" "$C/Info.plist"
fi
cp -R lab "$C/Resources/"
cp agents/*.plist "$C/Library/LaunchAgents/"
ditto "$SP/Sparkle.framework" "$C/Frameworks/Sparkle.framework"
cp "$SP/LICENSE" "$C/Resources/Sparkle-LICENSE"

pin() { sed -n "s/^$1=//p" agent-stats.pin; }
if [ -n "${AGENT_STATS_BIN:-}" ]; then
  cp "$AGENT_STATS_BIN" "$C/Helpers/agent-stats"
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
  lipo -create -output "$C/Helpers/agent-stats" "$CACHE/aarch64-apple-darwin/agent-stats" "$CACHE/x86_64-apple-darwin/agent-stats"
fi
chmod 755 "$C/Helpers/agent-stats"

# Inside out: Sparkle's helpers, the framework, agent-stats, then the app, whose signature covers them all.
ID=${SIGN_IDENTITY:--}
if [ "$ID" = - ]; then OPTS=""; else OPTS="--options runtime --timestamp"; fi
FW="$C/Frameworks/Sparkle.framework/Versions/B"
codesign --force --sign "$ID" $OPTS "$FW/XPCServices/Installer.xpc"
codesign --force --sign "$ID" $OPTS --preserve-metadata=entitlements "$FW/XPCServices/Downloader.xpc"
codesign --force --sign "$ID" $OPTS "$FW/Autoupdate"
codesign --force --sign "$ID" $OPTS "$FW/Updater.app"
codesign --force --sign "$ID" $OPTS "$C/Frameworks/Sparkle.framework"
codesign --force --sign "$ID" $OPTS --identifier com.kilcazn.tokiscope.agent-stats "$C/Helpers/agent-stats"
codesign --force --sign "$ID" $OPTS "$APP"
codesign --verify --deep --strict "$APP"
echo "Built $APP $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$C/Info.plist") with $("$C/Helpers/agent-stats" version)"
