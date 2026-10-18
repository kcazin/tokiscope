#!/bin/sh
# Makes a release in build/dist/: Tokiscope-<version>.dmg (signed, notarized, stapled) and appcast.xml, the feed the
# installed apps read for updates (Sparkle). The release workflow runs it on a v* tag and publishes both.
#   ./dist.sh 1.2.3
# Env: SIGN_IDENTITY "Developer ID Application: … (TEAM)" (else ad hoc, and no notarization);
#      ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID, an App Store Connect API key for notarytool (else not notarized);
#      SPARKLE_KEY_FILE, the update signing key (else sign_update reads it from the login keychain).
set -e
cd "$(dirname "$0")"
V=${1:?usage: dist.sh <version>}
OUT=build/dist APP=build/Tokiscope.app DMG="build/dist/Tokiscope-$V.dmg"
TOKISCOPE_VERSION=$V ./build.sh
rm -rf "$OUT" && mkdir -p "$OUT"

NOTARIZE=""
if [ -n "${SIGN_IDENTITY:-}" ] && [ -n "${ASC_KEY_PATH:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then NOTARIZE=1; fi
notarize() { xcrun notarytool submit "$1" --key "$ASC_KEY_PATH" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER_ID" --wait; }

# The app first, so its ticket is stapled to it wherever it's copied; then the disk image round it.
if [ -n "$NOTARIZE" ]; then
  ditto -c -k --keepParent "$APP" "$OUT/app.zip"
  notarize "$OUT/app.zip"
  rm "$OUT/app.zip"
  xcrun stapler staple "$APP"
fi
STAGE=$(mktemp -d)
ditto "$APP" "$STAGE/Tokiscope.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname Tokiscope -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"
if [ -n "${SIGN_IDENTITY:-}" ]; then codesign --force --sign "$SIGN_IDENTITY" --timestamp "$DMG"; fi
if [ -n "$NOTARIZE" ]; then notarize "$DMG"; xcrun stapler staple "$DMG"; fi

# The feed: one item, this release, signed for Sparkle.
SIG=$(build/cache/sparkle-2.10.0/bin/sign_update ${SPARKLE_KEY_FILE:+--ed-key-file "$SPARKLE_KEY_FILE"} "$DMG")
cat > "$OUT/appcast.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Tokiscope</title>
    <item>
      <title>Tokiscope $V</title>
      <pubDate>$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')</pubDate>
      <sparkle:version>$V</sparkle:version>
      <sparkle:shortVersionString>$V</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>https://github.com/kcazin/tokiscope/releases/tag/v$V</sparkle:releaseNotesLink>
      <enclosure url="https://github.com/kcazin/tokiscope/releases/download/v$V/Tokiscope-$V.dmg" type="application/octet-stream" $SIG />
    </item>
  </channel>
</rss>
EOF
echo "Made $DMG$([ -n "$NOTARIZE" ] && echo ", notarized" || echo ", not notarized") and $OUT/appcast.xml"
