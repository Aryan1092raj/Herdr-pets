# HERDR-PETS

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![herdr-mod](https://img.shields.io/badge/herdr-mod-7c3aed.svg)](https://herdr.dev/mods/)
[![herdr-app 0.1.10+](https://img.shields.io/badge/herdr--app-0.1.10%2B-blue.svg)](https://herdr.dev/)
[![CI](https://github.com/Aryan1092raj/Herdr-pets/actions/workflows/ci.yml/badge.svg)](https://github.com/Aryan1092raj/Herdr-pets/actions/workflows/ci.yml)
![JavaScript](https://img.shields.io/badge/javascript-ES%20modules-f7df1e.svg)

HERDR-PETS is a mod for the Herdr desktop app (herdr-app). Every running coding agent gets a small pixel pet in a strip at the bottom of the window. The pets roam, bounce, sleep and chat, so you can tell at a glance which agents are blocked, working, finished or idle.



## The pets

Claude Code and Codex agents get their own sprite. Every other agent (cline, opencode, aider, gemini and so on) gets one of four creatures, picked from its terminal address, so it keeps the same one for its whole life. In the app each pet is tinted by its status or by the color you pick in settings.

| <img src="docs/sprites/claude-code.svg" width="56" alt="claude-code"> | <img src="docs/sprites/codex-openai.svg" width="56" alt="codex-openai"> | <img src="docs/sprites/blob.svg" width="56" alt="blob"> | <img src="docs/sprites/cat.svg" width="56" alt="cat"> | <img src="docs/sprites/ghost.svg" width="56" alt="ghost"> | <img src="docs/sprites/bot.svg" width="56" alt="bot"> |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **claude-code** | **codex-openai** | **blob** | **cat** | **ghost** | **bot** |
| Claude Code | Codex | any other agent | any other agent | any other agent | any other agent |

Four more creatures are there to pick by hand from a pet's right-click menu:

| <img src="docs/sprites/frog.svg" width="56" alt="frog"> | <img src="docs/sprites/owl.svg" width="56" alt="owl"> | <img src="docs/sprites/bunny.svg" width="56" alt="bunny"> | <img src="docs/sprites/spike.svg" width="56" alt="spike"> |
| :---: | :---: | :---: | :---: |
| **frog** | **owl** | **bunny** | **spike** |

You can add your own sprites, or install a community pack, with a folder and one line of JSON. See [docs/PACKS.md](docs/PACKS.md).


How it Looks in App:
![HERDR-PETS strip with every kind of pet](docs/strip.png)
## What the pets do

| Status | Pet |
| --- | --- |
| `blocked` | runs to the front (left end) of the strip, bounces fast and shows **!** |
| `error` | runs to the front too, flashes and shows **✗** |
| `done` | roams while it hops and shows **✓** (the app turns done into idle once you look at the agent) |
| `working` | roams the whole strip, picking a new spot every 3 seconds |
| `idle` | shuts its eyes, breathes with `zzz` and drifts a little each beat |

Awake pets blink now and then.

### Agents that start agents

Agents started by another agent through herdr-core (`hc run`, for example a codex or cline helper) get their own pet, labelled with its hc name and linked to the agent that started it. A working helper walks over to its parent and the two chat in speech bubbles for a few seconds. The parent asks things like "need anything?", and the helper answers from its real status, such as "on it…". Each pet remembers its last few lines and picks a different one next time. Then the helper wanders off and comes back. A blocked helper runs to its parent and says "stuck, help?" or "need a hand", and the parent answers "on my way". A finished helper reports "done ✓", and the parent says "nice!". An agent's internal subagents are not hc terminals, so they don't appear.

## Play with them

| Do this | What happens |
| --- | --- |
| Click a pet | it bounces and shows hearts |
| Double-click a pet | focuses its agent |
| Drag a pet | picks it up and moves it; it stays put for a moment after you drop it |
| Flick and let go | throws it, and it glides to a stop |
| Hover a pet | tooltip with its name, status, how long it has been working, its progress and its task |
| Right-click a pet | menu: focus, peek, show as pane, restart and kill (both ask twice), quick replies for a blocked agent (ask twice), mute sounds, star, and pick its color and sprite |
| `▾` / `▴` at the left end | folds the strip to a thin bar, and opens it again |
| `⚙` next to the arrow | opens the settings |
| Scroll, or `‹` `›` at the right end | shows other pets when more agents run than fit |
| Click the strip, then arrows, `Home`, `End` | moves a highlight between pets |
| `Enter` / `F` / `M` on the highlighted pet | focuses its agent / stars it / opens its menu |
| `N` | jumps to the next blocked or errored agent and opens it |

The settings dialog has five choices, and they are kept across restarts:

- **Show pets**: on or off. Off folds the strip away.
- **Sound when blocked or done**: off by default. Plays the app's attention sounds when a pet turns blocked or done. A pet muted in its menu stays quiet.
- **Warn when an agent looks stuck**: on by default. Every minute the mod reads the last lines of each working terminal and keeps only a hash of them. If a working agent's screen has not changed for 10 minutes, its pet says "still on it?" and one toast names it.
- **Group pets by space**: off by default. Each space gets its own stretch of the strip, sized by its pet count, with a divider between stretches. Helpers stay in their parent's space.
- **Color**: by status (the default), or one of your theme's accent and ANSI colors for all pets.

A starred pet (★) sorts right after blocked ones, stays where you last dropped it, and returns there after a restart. Your sprite picks, stars and mutes are kept per terminal address.

Each pet is labelled with its space name, or with its hc name when it has no pane. If more agents run than fit in the strip, blocked ones are kept first, then starred ones, and the rest scroll.

An agent that reports its own progress (0 to 100) gets a thin bar under its sprite and the percentage in its tooltip, and the words it reports for its task replace the terminal title there. A blocked agent that says why (permission, question, auth) shows the reason. The app gives no token counts, so none are shown.

A line joins each helper to the agent that started it. When two or more agents have all finished, one toast says how many and how long the longest took.

### Quick replies

A blocked pet's menu lists the replies in `mods/herdr-pets/replies.json`:

```json
{ "replies": ["continue"] }
```

Picking one asks you to click again, then types the text and presses Enter in that terminal (`hc send --force`). Only your click sends anything; add replies such as `y` yourself if you want them. The file takes up to four replies of 80 characters each.

## Install

Requirements: Herdr app (herdr-app) 0.1.10 or later.

Option A: tell the agent in your Herdr app `Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Aryan1092raj/Herdr-pets`. It reads every file, copies `mods/herdr-pets/` into place, and rebuilds from [RECIPE.md](RECIPE.md) only if the files don't work on your version.

Option B, manual:

```sh
git clone https://github.com/Aryan1092raj/Herdr-pets.git
cp -r Herdr-pets/mods/herdr-pets ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/herdr-pets
```

The first time the app sees the folder, it docks the strip at the bottom of the current layout, 64 px tall. If the name `herdr-pets` is already taken, rename the folder and change the `MOD` constant at the top of `main.js` to match, because sprite paths use it.

To remove it, delete `~/.config/herdr-app/mods/herdr-pets`.

## What it reads

HERDR-PETS reads the app's live agent and terminal lists (`agents()` and `terminals()` from the `herdr` module, which include each terminal's parent and status report). It makes no network requests and reads no files outside its folder (`packs/index.json` and `replies.json`). It runs `hc read` on working terminals once a minute to compare screens, and `hc send` only when you click a quick reply. Its actions are `agent.focus` when you double-click a pet or pick Focus, `layout.resize` on its own strip when you fold it, `terminal.kill` and `terminal.open` when you pick Kill or Restart from a pet's menu, and `playSound` when sound is on. Your settings are stored with the app's `setShared`.

## Develop

Run the logic tests with Node 18 or later, and check the mod with herdr-app:

```sh
node --test test/pets.test.mjs
herdr-app check mods/herdr-pets
```

The mod lives in `mods/herdr-pets/`:

- `main.js` draws the strip, the pets and the settings dialog, and handles the mouse.
- `pets.js` holds placement, roaming, dialogue and throw logic, with no app imports.
- `packs/index.json` lists extra sprite packs (see [docs/PACKS.md](docs/PACKS.md)). `replies.json` lists the quick replies.
- `*.svg` are the ten sprites and the settings gear. `docs/sprites/` holds tinted copies for this README.
- `mod.json` docks the strip at the bottom, 64 px tall.

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md).

## License

HERDR-PETS is released under the [MIT License](LICENSE). Copyright (c) 2026 Aryan Raj.
