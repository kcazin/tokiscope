# Tokiscope

A small window that floats over the macOS desktop and shows your LLM agents at work: pixel-art machines carry today's
tokens to the projects they went to. A menu bar item picks the layout (trucks, cranes, belt, silos) or a bubble, the
zoom, click-through, background, and whether it sits above windows or on the desktop.

- `Tokiscope.swift` — the app: the window, the menu, the hub feed, and the pages served from the app bundle.
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

Build: `./build.sh && open "build/Tokiscope.app"` (only needs the Xcode command line tools).

Stats come from [kcazin/agent-stats](https://github.com/kcazin/agent-stats): the hub over the tailnet when this Mac can
reach it (every repository by name), otherwise the public relay, which the app fetches for the pages. Both are
streamed, so a change shows within a second or two: the app follows the hub's `/api/stream` and the relay's `/stream`
(applying its merge patches) and pushes each update into the page (`window.hubFeed`, `window.relayFeed`); a page in a
browser opens the relay's stream itself. Without a stream (an older hub or relay) they poll every 15 s as before.
Pushed updates come a second apart, so the machines hand each project's new tokens out over the time since its last
ones (2–8 s) rather than over the 15 s between polls, and the rate is the last 30 s, sampled every 15 s for the graph.

To work on the pages without rebuilding: `python3 -m http.server 8765` here, then Load From > Local Copy in the menu,
or open http://localhost:8765/lab/ in a browser.
