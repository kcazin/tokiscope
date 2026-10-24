# Working on Tokiscope

How the app is put together, how to build and release it. What it does for its users is in the [README](../README.md).

## Layout

- `Tokiscope.swift` — the app: the bubble's window, the menu, agent-stats' background items, the hub feed, and the
  pages served from the app bundle.
- `lab/` — the pages it shows. `lab/bubble.html` is the bubbles and what they open into (the cards, the layouts);
  `?b=<bubble>&open=<card:key|layout>&app=1` is what the app loads. `lab/index.html` is every layout side by side
  (`?only=<layout>` one alone), `lab/scene.html` every country's backdrop at dawn, by day, at dusk and at night.
  `?recent=<hours>` changes how long a project stays on after it was last worked on (2 by default).
- `lab/settings.html` — the app's Settings window (menu > Settings…, or `--settings [machines | general]` at launch):
  a live preview, every bubble and everything it can open into running live, the ones in use outlined; click one to
  use it. Count picks the tokens that count (input, cache read, cache write, output; `?kinds=in,cr,cw,out` on any
  page): everything shows only those, with today's figures from agent-stats 0.7 on, which splits each project's tokens
  by kind; a unit (a square, a crate) is worth less when fewer count.
- `icon/` — the app icon, pixel art like the widget: `make_icon.py` draws it, `make_icns.sh [concept]` makes the
  `AppIcon.icns` the build ships.
- `lab/flow.html` — the throughput lab: the streamed tokens read as speed (an odometer, a seismograph of each agent's
  turns, the output as a rain of letters, level meters, a tachometer bubble). `?only=<piece>` shows one alone;
  `?relay=demo` makes agents up (on bubble.html too), to see it move when nobody is working.

## From a script

`Tokiscope --stats create | replica | hub | join "<line>" | pair | take-over | start | stop | status` does the same
from a script; `--stats add-machine [<ssh target>]` opens the Add Machine window, `--stats request <url>` asks a
fleet to let this Mac in. `dev/fake-agent-stats` stands in for agent-stats' fleet commands, to try that UI.

## Build

`./build.sh && open "build/Tokiscope.app"` needs only the Xcode command line tools. It downloads the agent-stats
release `agent-stats.pin` names, checks both Mac archives against the pin and merges them into one universal binary
(`Contents/Helpers/agent-stats`), next to its launchd jobs (`agents/`, in `Contents/Library/LaunchAgents`).
`AGENT_STATS_BIN=<path> ./build.sh` ships a local build instead (`cargo build --release` in an agent-stats checkout).
Sparkle, which updates the app, is pinned the same way in build.sh. A local build is signed ad hoc and never updates
itself.

## Releases

Push a `v1.2.3` tag. The release workflow runs `dist.sh 1.2.3`: a universal build signed with the Developer ID and the
hardened runtime, notarized and stapled, in `Tokiscope-1.2.3.dmg`, and `appcast.xml`, the update feed, signed with the
Sparkle key. It publishes both as the GitHub release. Installed apps read
`releases/latest/download/appcast.xml` daily (or *Check for Updates…*), download the update, install it and relaunch,
then restart agent-stats' background items on the new binary.

- Secrets: `DEVELOPER_ID_P12` (base64 of the Developer ID Application certificate and key) and
  `DEVELOPER_ID_P12_PASSWORD`; `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` (base64 of the `.p8`), an App Store
  Connect API key for notarization; `SPARKLE_PRIVATE_KEY`.
- The Sparkle private key is also in the login keychain of the Mac that made it (`generate_keys`). Keep a copy: without
  it, installed apps can't be sent another update. Its public half is `SUPublicEDKey` in Info.plist.
- When agent-stats releases, a daily workflow opens a pull request that pins it (`agent-stats.pin`); merge it, then tag.

The stats are streamed, so a change shows within a second or two: the app follows the hub's `/api/stream` (and a
relay's `/stream`, applying its merge patches) and pushes each update into the page (`window.hubFeed`,
`window.relayFeed`); a page in a browser reads the relay given as `?relay=<url>` itself. Without a stream (an older hub
or relay) they poll every 15 s as before. Pushed updates come a second apart, so the machines hand each project's new
tokens out over the time since its last ones (2–8 s) rather than over the 15 s between polls, and the rate is the last
30 s, sampled every 15 s for the graph.

To work on the pages without rebuilding: `python3 -m http.server 8765` here, then Pages from > Local copy in Settings ›
General › Advanced, or open http://localhost:8765/lab/ in a browser.
