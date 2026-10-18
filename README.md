# Tokiscope

A small window that floats over the macOS desktop and shows your LLM agents at work: pixel-art machines carry today's
tokens to the projects they went to. A menu bar item picks the layout (trucks, cranes, belt, silos) or a bubble, the
zoom, click-through, background, and whether it sits above windows or on the desktop.

- `Tokiscope.swift` — the app: the window, the menu, agent-stats' background items, the hub feed, and the pages served
  from the app bundle.
- `lab/` — the pages it shows. `lab/index.html` is every layout side by side, `lab/bubble.html` the bubbles, the cards
  they show on hover and the fields they open (the layouts, a throughput dashboard, the trucks at speed);
  `?only=<layout>` and `?b=<bubble>&art=<layout>&app=1` are what the app loads (`&card=<card>` picks the hover card);
  `?recent=<hours>` changes how long a project stays on after it was last worked on (2 by default).
- `lab/settings.html` — the app's Settings window (menu bar > Settings…, or `--settings` at launch): every bubble, card
  and layout running live, the ones in use outlined; click one to use it. Count picks the tokens the rates, meters,
  odometers, traces and rain count (input, cache read, cache write, output; `?kinds=in,cr,cw,out` on any page): with
  some of them, those views follow the agents' turns kind by kind; the trucks always carry every token.
- `lab/flow.html` — the throughput lab: the streamed tokens read as speed (an odometer, a seismograph of each agent's
  turns, the output as a rain of letters, level meters, a tachometer bubble). `?only=<piece>` shows one alone;
  `?relay=demo` makes agents up (on bubble.html too), to see it move when nobody is working.

## Your machines

Tokiscope carries [agent-stats](https://github.com/kcazin/agent-stats), which counts the tokens your coding agents
(Claude Code, Codex and others) use, and runs it as the app's background items. One Mac runs the **hub**, which keeps
every machine's stats; every machine, that one included, runs a **reporter** that counts its own agents and sends
them to the hub. The widget shows the hub's view.

- **First launch** asks which part this Mac plays: *This Is the Main Mac* starts the hub and a reporter;
  *Join Another Mac…* takes the line the main Mac gives. The menu has *Set Up This Mac…* after.
- **Add Machine…** on the main Mac makes a one-time code (10 minutes). The first time, it opens the hub to the
  network (port 7777, over Tailscale or the local network); each machine still needs its own code to report or read.
  On another Mac, paste the line into Tokiscope's *Join Another Mac…*. On Linux, or a Mac without Tokiscope, the
  terminal line installs agent-stats and joins (`curl … install.sh | sh && ~/.local/bin/agent-stats join … --code …`).
- An agent-stats **installed on its own** (install.sh) keeps running as it is; the widget reads it, and *Let Tokiscope
  Run agent-stats…* moves its reporter, hub and updater to the app's background items (config and stats stay).
- The widget reads the hub on this Mac first, then the hubs this Mac joined, with the read-only token each gave it.
  A **relay** (*Load From > Other Stats Relay…*) is read when no hub answers.

`Tokiscope --stats hub | join "<line>" | pair | take-over | stop | status` does the same from a script.

## Build

`./build.sh && open "build/Tokiscope.app"` needs only the Xcode command line tools. It downloads the agent-stats
release `agent-stats.pin` names, checks both Mac archives against the pin and merges them into one universal binary
(`Contents/Helpers/agent-stats`), next to its launchd jobs (`agents/`, in `Contents/Library/LaunchAgents`).
`AGENT_STATS_BIN=<path> ./build.sh` ships a local build instead (`cargo build --release` in an agent-stats checkout).

The stats are streamed, so a change shows within a second or two: the app follows the hub's `/api/stream` (and a
relay's `/stream`, applying its merge patches) and pushes each update into the page (`window.hubFeed`,
`window.relayFeed`); a page in a browser reads the relay given as `?relay=<url>` itself. Without a stream (an older hub
or relay) they poll every 15 s as before. Pushed updates come a second apart, so the machines hand each project's new
tokens out over the time since its last ones (2–8 s) rather than over the 15 s between polls, and the rate is the last
30 s, sampled every 15 s for the graph.

To work on the pages without rebuilding: `python3 -m http.server 8765` here, then Load From > Local Copy in the menu,
or open http://localhost:8765/lab/ in a browser.
