# Your machines

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

The same from a script, and how it is built: [DEVELOPMENT.md](DEVELOPMENT.md#from-a-script).
