# herdr-pets

A strip along the bottom of the window where every running agent is a small pixel creature that roams the whole row. Color and motion show each agent's status, so a blocked agent is easy to spot without reading the sidebar. Claude Code and Codex agents get their own sprites, and every other agent gets one of four creatures. Helpers that an agent starts through herdr-core walk over to their parent and chat in speech bubbles. Pets blink, show hearts when clicked, can be dragged and thrown, and a double-click focuses the agent. A small arrow folds the strip away, and a gear opens a settings dialog.

![herdr-pets](preview.png)

## What you see

- One block, 64px tall, docked at the bottom of the layout and filled with the theme's `chrome` color. When the theme is dark (`chrome` luminance under 128), `chrome`, `surface` and `popover` become pure `#000000` and `hover` and `selected` become `#1a1a1a`, so the strip, speech bubbles and settings dialog are black.
- Two 14 × 16px buttons at its top-left corner, 4px in and 1px down, 2px apart, in `muted`: a `▾` fold arrow and an 11px gear icon. Each gets the `hover` background under the pointer. Pets keep 40px clear of the left edge so both stay clickable.
- Pets standing on the strip's bottom edge, 2px up, one per agent, anywhere along the row. A pet is 56px wide and has three rows:
  - a 12px badge row: a status badge, a speech bubble while it chats, or hearts after a click;
  - a 28 × 28px sprite, tinted with the theme's color for its status (`working`, `blocked`, `done` or `idle`), or with the one color picked in settings;
  - a 12px label in `muted`, `text_xs`, centered and truncated: the agent's space name, or its hc name when it has no pane.
- With no agents, "No agents yet" in `dim`, centered. With pets turned off, "Pets are off".
- Sprites: a pixel Claude logo for agents whose app starts with `claude`, the Codex logo for apps starting with `codex`, and for everyone else one of four original 16 × 16 pixel creatures, `blob`, `cat`, `ghost` and `bot`. An agent keeps the same creature and first spot for its whole life.
- Eyes: each sprite blinks now and then, each pet at its own pace (every 2.6–5 s). Idle pets keep their eyes shut.
- A speech bubble is a `popover`-colored pill with a 1px `border` and 4px radius, holding one line of `text_xs` text in `foreground`, centered over the pet and 44px wider than it.

## How it behaves

- A 3 s beat drives the motion. Each beat, working and done pets pick a new spot up to 160px either way and walk there at an even pace for the whole 3 s, so they stroll without stopping. Wandering helpers do the same. Idle pets drift up to 60px either way.
- **blocked:** a blocked or errored pet without a parent runs to the front in 700ms, easing out, lined up from the left in address order. A blocked one bounces 8px every 500ms, and its badge is a bold **!** in `blocked`. An errored one fades between 40% and 100% opacity every 800ms.
- **done:** hops 5px every 1100ms and shows a bold **✓** in `done`. The app turns done into idle once the person looks at the agent.
- **working:** bobs 2px every 400ms. No badge.
- **idle:** fades between 50% and 80% opacity every 3.2 s, eyes shut, and its badge cycles `z`, `zz`, `zzz` every 700ms in `dim`.
- **Helpers** are agents started by another shown agent through `hc run`. A working helper cycles through three beats: it walks to stand beside its parent (one slot to the right, or to the left at the right edge), then they chat, then it wanders to a random spot. The parent holds still during the first two beats. While they chat:
  - the parent asks one of "how's it going?", "need anything?", "status?" or "all good?";
  - the helper answers one of "on it…", "almost there", "reading files" or "running tests".

  A blocked helper stands beside its parent saying "stuck, help?", and the parent says "on my way". A done helper says "done ✓", and the parent says "nice!". Lines rotate with the beat.
- Only as many pets as fit `(width − 40) / 56` are drawn, at least one: blocked first, then done, working and idle.
- **Hover** a pet: `hover` background, a grab cursor and a tooltip, `<label>: <status>`. The arrow's tooltip is "Hide pets" or "Show pets", the gear's "Pet settings".
- **Click** a pet: hearts (`♥`, `♥ ♥`, `♥ ♥ ♥`, changing every 260ms, in `ansi5`) replace its badge for 1.6 s, and it bounces 6px every 360ms.
- **Double-click** a pet: focuses its agent.
- **Drag** a pet: it lifts 6px, draws over the others, and follows the pointer from the spot where it was grabbed. Releasing it, or leaving the strip, drops it there, and it stays for two beats before carrying on, even when blocked or a helper. A press that dragged doesn't count as a click.
- **Throw**: if the pointer moved faster than 0.3px/ms over the last 100ms before release, the pet carries on by 400ms worth of that speed, gliding there in 800ms and easing out.
- **Fold**: the `▾` arrow shrinks the strip to 18px, leaving only `▴` and the gear. `▴` brings it back to 64px with the pets where they were. A strip under 32px tall counts as folded, so the state survives reloads.
- **Settings**: the gear opens a 300 × 340px dialog that shows only the settings, with 16px padding, 13px text and 14px gaps:
  - a semibold "Pets" title with a `✕` close button on the right;
  - "Show pets" with an On / Off pair; the chosen one has an `accent` border and the `selected` background. Off empties and folds the strip, On opens it again;
  - "Color" with a row of 20px round swatches: "By status" (four dots in the status colors, the default), then `accent` and `ansi1` to `ansi6`. The chosen one has a `foreground` ring, and picking one retints every pet;
  - a `dim` hint: "Click a pet for hearts, double-click to open its agent. Drag to move it, flick to throw it."

  Both choices are kept across restarts.
- **More settings**: the dialog also has "Sound when blocked or done" (off by default; plays the app's `done` and `blocked` sounds, skipping pets muted in their menu), "Warn when an agent looks stuck" (on by default) and "Group pets by space" (off by default). All are kept across restarts, together with each pet's sprite, color, star, mute and dropped spot, keyed by terminal address.
- **Right-click** a pet: a menu with focus, peek, show as pane, restart and kill (restart and kill ask for a second click), mute sounds, star, a color row and a sprite row. For a blocked agent it also lists the replies from `replies.json` (up to four, 80 characters each); a second click types the reply and presses Enter in that terminal. A starred pet sorts right after blocked ones and returns to its dropped spot after a restart.
- **Keyboard**: click the strip, then the arrows, `Home` and `End` move a highlight; `Enter` focuses, `F` stars and `M` opens the menu. `N` focuses the next blocked or errored agent.
- **Status detail**: progress (0 to 100) reported by the agent shows as a 3px bar under its sprite and in its tooltip, and a reported block reason (permission, question, auth) shows in the tooltip.
- **Stuck warning**: on every 20th beat (60 s) the mod reads the last lines of each working terminal and keeps only a hash. If the hash has not changed for 10 minutes, the pet says "still on it?" and one toast names it.
- **Group by space**: each space gets its own stretch of the strip, sized by its pet count, with a divider between stretches. Helpers stay in their parent's space.
- **Lines and recap**: a line joins each helper to its parent. When two or more agents have all finished, one toast says how many and how long the longest took.
- **Scroll**: when more agents run than fit, blocked ones are kept first, then starred ones, and the rest scroll with the wheel or `‹` `›` at the right end.

## Built from

- **One mod**, `mods/herdr-pets/`, with `mod.json`, `main.js`, `pets.js` and seven SVGs. No `layouts/` folder and no `keys.json`. The manifest is `{ "place": "bottom", "size": 64, "title": "Pets" }`, so the app docks it under the current layout.
- **`pets.js`**, no imports, the logic the tests cover:
  - `collect(terminals, agents)` keeps live terminals with a status. The app is the terminal's OSC 7501 `report.app`, else `program.key`, else hc's `agent`. The label is `space_name`, then `tab_name` from `agents()`, else the hc `name`. `parent` is kept only when the parent is also shown.
  - `kindFor(app, seed)` maps `/^claude/` to `claude-code` and `/^codex/` to `codex-openai`, else `KINDS[seed % 4]`, where the seed is an FNV-1a hash of the terminal address.
  - `place(list, prev, width, tick, roam, rand, held)` returns `{address, status, label, parent, kind, seed, x, meet, say}`. It places parents before children at any depth, keeps the previous `x` unless `roam`, leaves `held` addresses alone, and clamps to `[40, width − 56]`.
  - `landing(samples)` takes `[{x, t}]` pointer samples and returns the throw target, or `null` for a slow release.
  - `node --test test/pets.test.mjs` runs 18 tests.
- **`main.js`**, a `View` using `gpui-kit` and `gpui-base`:
  - reads `agents()`, `terminals()`, `theme()`, `settings().zoom`, `layout()` and `props()` from `herdr`;
  - one `cx.timer.every(3000)` beat, and `cx.timer.after(1600)` to clear hearts;
  - each pet is an absolute `v_flex` slot with `left(x)` and `transition("left")` (3 s linear; 700ms ease-out when blocked; 800ms ease-out after a throw; 30ms while dragged), holding a `relative` body with `loop("top")` or `loop("opacity")` for the bounce or breath. Badges use `frames`;
  - blinking: per eye hole, a lid div in the tint color inside an `overflow_hidden` box, on a linear `loop("top")` from 16 eye-heights above down to 0. Eye-hole rectangles per sprite are in the `EYES` table;
  - mouse: `on_mouse_down` on the pet, `on_mouse_move`, `on_mouse_up` and `on_hover(false)` on the root, `on_click` with `click_count` for hearts and focus;
  - settings: the gear calls `openOverlay({ mod: "herdr-pets", kind: "dialog", width: 300, height: 210, props: { panel: "settings" } })`; the same `View` renders only the dialog when `props().panel === "settings"`, closes with `closeOverlay(props().overlay)`, and stores `{ on, color }` with `setShared("herdr-pets", …)`, read back with `shared("herdr-pets")`.
- **Commands**, through `run()`: `agent.focus {terminal}` on double-click, and `layout.resize {id, px}` on the strip's own node, found by walking `layout()` for `content.mod === "herdr-pets"`.
- **Shipped mods:** none.
- **Art:** `blob.svg`, `cat.svg`, `ghost.svg` and `bot.svg` are original 16 × 16 silhouettes of `<rect fill="currentColor">` with transparent eye holes. `gear.svg` is an original 16 × 16 pixel gear: a square ring with eight 2 × 2 teeth. `claude-code.svg` is the Claude logo (viewBox `0 -4 24 24`, `shape-rendering="crispEdges"`), and `codex-openai.svg` is the Codex logo with `fill="currentColor"`, both 24 × 24. All are drawn with `svg()` and tinted with `text_color`.
- It runs no programs, reads no files outside its folder, and makes no network requests.

## Watch out

- `line_height(12)` is a 12× multiplier, not 12px. Use `line_height("12px")`.
- In herdr-app 0.1.10, `on_size_change` and `local_position` report values before the app's zoom while layout lengths are zoomed. Divide by `settings().zoom`, or pets drift right and drags lag the pointer.
- The first render happens before any size report. Don't remember spots computed at width 0, or every pet that doesn't walk stays stuck at the left edge.
- Remembered spots must survive redraws caused by data changes. Only the beat may move roaming pets, or every status change makes them jump.
- Don't name the first argument of `init` `props`: it hides the `props()` import, and the settings dialog then draws the whole strip.
- `agents()` lists only terminals in panes. Helpers started with `hc run --bg` show up only in `terminals()`. An agent's own internal subagents aren't hc terminals and never appear.
- SVG paths are `mods/herdr-pets/<kind>.svg`, relative to the app home. If the folder is renamed, change `MOD` at the top of `main.js`.
- Two pets close together can overlap, and so can their bubbles.

## Done when

- `herdr-app check mods/herdr-pets` passes, and `herdr-app status` shows no errors.
- `node --test test/pets.test.mjs` passes 18 of 18.
- With a Claude Code agent, a Codex agent and a few others running, the strip shows the Claude and Codex sprites and the four creatures, each tinted by status.
- With an agent running and a helper started from it via `hc run --bg`, shots over about 10 s show the helper walk to its parent, both show bubbles side by side, then the helper walk away.
- When an agent becomes blocked, its pet runs to the front, bounces and shows **!**.
- A click shows hearts, a double-click focuses the agent, a drag moves the pet, and a fast flick throws it.
- The gear opens a dialog showing only the settings. Off empties and folds the strip, and a swatch retints every pet.
- `▾` leaves only `▴` and the gear at 18px; `▴` brings the pets back where they were.
