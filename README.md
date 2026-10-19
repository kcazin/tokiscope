# Tokiscope

A small bubble that floats over the macOS desktop and shows your LLM agents at work. Click it and it opens into a
card or one of the pixel-art machines carrying today's tokens to the projects they went to (trucks, cranes, belt,
silos), the trucks under the sky where you are, by your country's landmarks. The menu (the menu bar item, or a right
click on the bubble) has today's tokens at a glance, hides the bubble and opens Settings.

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

## Your machines

Tokiscope carries [agent-stats](https://github.com/kcazin/agent-stats), which counts the tokens your coding agents
(Claude Code, Codex and others) use, and runs it as the app's background items.

- **First launch** asks nothing: this Mac starts counting its own agents, with a hub only this Mac reaches, and
  Settings opens once with a welcome. *Start Counting* in Settings › Machines does it if that couldn't.
- Other machines are all in **Settings › Machines**. Your machines form a **fleet**: every Mac with Tokiscope is a
  **replica**, which runs the hub, keeps every machine's stats and syncs them with the other Macs, so the bubble shows
  everything even while the other Macs sleep. Machines without Tokiscope (a Linux box, say) only run the reporter and
  send to whichever Mac answers. No Mac is the main one.
- **Join Another Mac…** looks for a fleet on your tailnet and local network and asks a Mac of it to let this one in
  (Settings also offers one it finds). Both Macs show the same four digits; approve on any Mac of the fleet. This
  Mac's stats so far go with it. *Join by Address…* takes a Mac's address (or a line an older Add Machine… showed).
- **Add a Machine…** (on any Mac of the fleet) lists what it finds on the tailnet and the network. *Install* puts
  agent-stats on a Linux box or a Mac without Tokiscope over SSH, with your keys and `~/.ssh/config`, and shows each
  step; if SSH would ask for a password, it opens Terminal with `ssh-copy-id` instead. Any other SSH target goes in
  the field below. For a machine this Mac can't reach by SSH, *Make a Line* gives a one-time line to paste there.
  The first time, once you say so, this Mac becomes the fleet's first replica and opens its hub to the network (port
  7777, over Tailscale or the local network); every machine still needs to be approved or given a code to report or
  read.
- When a Mac asks to join, every Mac of the fleet asks you to approve it (also in the menu and Settings until someone
  does). Settings › Machines lists the others, who is online, and removes a machine.
- After an update that brings fleets, a Mac set up before that other machines report to becomes a replica on its
  own; if that fails, Settings says why and offers to try again, and everything keeps running as it was.
- An agent-stats **installed on its own** (install.sh) keeps running as it is; the bubble reads it, and *Let
  Tokiscope Run It…* moves its reporter, hub and updater to the app's background items (config and stats stay).
- The bubble reads the hub on this Mac first, then the hubs this Mac joined, with the read-only token each gave it.
  A **relay** (Settings › General › Advanced) is read when no hub answers.

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

## License

GPL-3.0-or-later: see [LICENSE](LICENSE). You may use, change and share Tokiscope; whatever you distribute that builds
on it must be under the GPL too, with its source. It ships [agent-stats](https://github.com/kcazin/agent-stats)
(GPL-3.0-or-later) and [Sparkle](https://sparkle-project.org) (MIT, its license in the app as `Sparkle-LICENSE`).
