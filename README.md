# herdr-pets

herdr-pets is a mod for the Herdr desktop app (herdr-app). It gives every running coding agent a small pixel pet in a strip at the bottom of the window, so you can see at a glance which agents are blocked, working, finished, or idle.

![herdr-pets](preview.png)

## What the pets do

| Status | Pet |
| --- | --- |
| `blocked` | runs to the front (left end) of the strip, bounces fast and shows **!** |
| `done` | hops in place and shows **✓** (the app turns done into idle once you look at the agent) |
| `working` | roams the whole strip, picking a new spot every 3 seconds |
| `idle` | sleeps where it stands and breathes, with `zzz` |

### Agents that start agents

Agents started by another agent through herdr-core (`hc run`, for example a cline helper) get their own pet. The pet is labelled with its hc name and linked to the agent that started it. A working helper walks over to its parent, and the two chat in speech bubbles for a few seconds. The parent asks things like "need anything?", and the helper answers from its real status, such as "on it…". Then the helper wanders off and comes back. A blocked helper runs to its parent and says "stuck, help?", and the parent answers "on my way". A finished helper reports "done ✓", and the parent says "nice!". Agents' internal subagents that are not hc terminals don't appear.

The ▾ arrow at the left end of the strip folds it down to a thin bar, and ▴ opens it again. Each pet is labelled with its space name, or with its hc name when it has no pane. Click a pet to focus its agent. Hover over a pet to see its name and status. Each agent keeps the same creature (blob, cat, ghost, or bot), picked from its terminal address. Colors come from your theme's status colors. If more agents run than fit in the strip, blocked ones are kept first.

## Install

Requirements: Herdr app (herdr-app) 0.1.10 or later.

Option A: ask the agent in your Herdr app to add the mod from `https://github.com/Aryan1092raj/Herdr-pets`. herdr-app's own guide explains how agents add shared mods.

Option B, manual:

```sh
git clone https://github.com/Aryan1092raj/Herdr-pets.git
cp -r Herdr-pets/mods/herdr-pets ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/herdr-pets
```

The first time the app sees the folder, it docks the strip at the bottom of the current layout, 64 px tall. If the name `herdr-pets` is already taken, rename the folder and change the `MOD` constant at the top of `main.js` to match, because sprite paths use it.

## Remove

Delete `~/.config/herdr-app/mods/herdr-pets`.

## What it reads

herdr-pets reads the app's live agent and terminal lists (`agents()` and `terminals()` from the `herdr` module, which include each terminal's parent). It runs no programs, reads no files outside its folder, and makes no network requests. Its actions are `agent.focus` when you click a pet and `layout.resize` on its own strip when you click the arrow.

## Develop

Run the layout logic tests with Node 18 or later:

```sh
node --test test/pets.test.mjs
```

Check the mod itself with:

```sh
herdr-app check mods/herdr-pets
```

The files are:

- `mods/herdr-pets/main.js`: the view
- `pets.js`: placement, roaming and dialogue, no app imports
- `*.svg`: the four creatures, tinted by status color
- `mod.json`: docks the strip at the bottom, 64 px tall

## License

MIT. See LICENSE.
