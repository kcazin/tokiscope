#!/bin/sh
# Builds "Tokiscope.app" into build/, with the pages in lab/ inside it. Needs only the Xcode command line tools.
#   ./build.sh && open "build/Tokiscope.app"
# Try a local copy of the pages first:  python3 -m http.server 8765, then Load From > Local Copy in the menu.
set -e
cd "$(dirname "$0")"
APP="build/Tokiscope.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -parse-as-library -o "$APP/Contents/MacOS/Tokiscope" Tokiscope.swift
cp Info.plist "$APP/Contents/"
cp -R lab "$APP/Contents/Resources/"
codesign --force --sign - "$APP"
echo "Built $APP"
