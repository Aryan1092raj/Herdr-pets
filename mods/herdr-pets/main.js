import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  agents, terminals, spaces, panes, theme, run, settings, layout, props, shared, setShared,
  openOverlay, closeOverlay, playSound, readTextFile, appHome, hc, notify,
} from "herdr";
import {
  collect, place, landing, describe, transitions, capacity, track, stalled, recap, links, hash,
  STUCK, PET, SLOT, LEFT, SPRITES, runtime,
} from "./pets.js";

// The folder name under ~/.config/herdr-app/mods: svg paths start at the app home.
const MOD = "herdr-pets";
const BADGE = 12;
const LABEL = 12;
const OPEN = 64; // strip height, px
const SHUT = 18; // folded: just the arrow and the gear
const STEP = 3000; // ms between new spots for roaming pets
const HOLD = 2; // beats a dropped pet stays put before it carries on
const HEARTS = 1600; // ms of hearts after a click
const POLL = 60000; // ms between looks at working terminals, to tell a stuck agent from a busy one
const WHEEL = 120; // ms between scroll steps, so a trackpad swipe moves one pet at a time
// Colors the settings offer, as theme names so they follow the theme. "status" colors each pet by its status.
const COLORS = ["status", "accent", "ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];

// Eye holes of each sprite in its own grid, [x, y, w, h]. Lids slide down over them to blink.
const EYES = {
  blob: { grid: 16, at: [[5, 5, 1, 2], [10, 5, 1, 2]] },
  cat: { grid: 16, at: [[6, 5, 1, 2], [9, 5, 1, 2]] },
  ghost: { grid: 16, at: [[5, 6, 1, 1], [10, 6, 1, 1]] },
  bot: { grid: 16, at: [[4, 6, 1, 1], [7, 6, 2, 1], [11, 6, 1, 1]] },
  frog: { grid: 16, at: [[4, 4, 1, 2], [11, 4, 1, 2]] },
  owl: { grid: 16, at: [[4, 5, 2, 2], [10, 5, 2, 2]] },
  bunny: { grid: 16, at: [[4, 6, 1, 2], [11, 6, 1, 2]] },
  spike: { grid: 16, at: [[4, 5, 1, 2], [11, 5, 1, 2]] },
  "claude-code": { grid: 24, at: [[6, 12.1, 1.5, 2.85], [16.5, 12.1, 1.5, 2.85]] },
  "codex-openai": { grid: 24, at: [[5.3, 7.9, 4.5, 8.4], [11.8, 14.4, 6.7, 2]] },
};

// shortcut: herdr-app 0.1.10 reports sizes and pointer positions before its zoom while layout units are zoomed; drop the division if a later version reports zoomed values.
const zoom = () => Number(settings().zoom) || 1;

// The person's choices, shared by the strip, its settings dialog and the pet menu, and kept across restarts.
// kinds: address -> sprite; muted, favs: address -> true; spots: address -> x of a favorite's saved place.
function prefs() {
  const p = shared(MOD) ?? {};
  const map = (v) => (v && typeof v === "object" ? v : {});
  return {
    on: p.on !== false,
    color: COLORS.includes(p.color) ? p.color : "status",
    sound: p.sound === true,
    stuck: p.stuck !== false, // warn when a working agent's screen stops changing
    group: p.group === true, // give each space its own stretch of the strip
    kinds: map(p.kinds),
    colors: map(p.colors), // address -> a pet's own color, over the shared one
    muted: map(p.muted),
    favs: map(p.favs),
    spots: map(p.spots),
  };
}

const save = (next) => setShared(MOD, { ...prefs(), ...next });

// Sprites are the built-in ones, or "<pack>/<sprite>" from packs/index.json.
const PACK_SPRITE = /^[\w-]+\/[\w-]+$/;
const validKind = (k) => typeof k === "string" && (SPRITES.includes(k) || PACK_SPRITE.test(k));
const spritePath = (kind) => `mods/${MOD}/${kind.includes("/") ? "packs/" : ""}${kind}.svg`;

// Extra sprites from packs/index.json: { "packs": { "<pack>": ["<sprite>", ...] } }, each sprite a file packs/<pack>/<sprite>.svg.
async function loadPacks() {
  try {
    const packs = JSON.parse((await readTextFile(`${appHome()}/mods/${MOD}/packs/index.json`)) ?? "{}").packs ?? {};
    return Object.entries(packs).flatMap(([pack, names]) => (Array.isArray(names) ? names.map((n) => `${pack}/${n}`) : []))
      .filter((k) => PACK_SPRITE.test(k));
  } catch {
    return [];
  }
}

const panel = () => props()?.panel;

// Stars or unstars a pet. A favorite keeps the spot it had when starred, and goes back there after a restart.
function toggleFav(address, x) {
  const { favs, spots } = prefs();
  const { [address]: was, ...restFavs } = favs;
  const { [address]: _spot, ...restSpots } = spots;
  save(was ? { favs: restFavs, spots: restSpots } : { favs: { ...favs, [address]: true }, spots: { ...spots, [address]: Math.round(x) } });
}

function toggleMute(address) {
  const { muted } = prefs();
  const { [address]: was, ...rest } = muted;
  save({ muted: was ? rest : { ...muted, [address]: true } });
}

// Quick replies for a blocked agent, from replies.json: { "replies": ["continue"] }. Only the person's click sends one.
async function loadReplies() {
  try {
    const list = JSON.parse((await readTextFile(`${appHome()}/mods/${MOD}/replies.json`)) ?? "{}").replies;
    return Array.isArray(list) ? list.filter((r) => typeof r === "string" && r.trim() && r.length <= 80 && !/[\u0000-\u001f\u007f]/.test(r)).slice(0, 4) : [];
  } catch {
    return [];
  }
}

// What the menu can offer this terminal: a pane to show it in, and the program to start again.
function menuInfo(address) {
  const term = terminals().find((c) => c.address === address);
  return {
    pane: panes().find((p) => p.terminal === address),
    restart: term?.program?.agent && term.program.key ? [term.program.key] : null,
    cwd: panes().find((p) => p.terminal === address)?.cwd ?? term?.cwd ?? null,
  };
}

function openMenu(p, replies = []) {
  const { pane, restart } = menuInfo(p.address);
  const quick = p.status === "blocked" ? replies : [];
  const rows = 5 + (pane ? 0 : 1) + (restart ? 1 : 0) + quick.length;
  openOverlay({
    mod: MOD, kind: "popup", width: 208, height: rows * 26 + 214,
    props: { panel: "menu", address: p.address, label: p.label, x: p.x, replies: quick },
  });
}

export default class Pets extends View {
  init(_props, cx) {
    // The same mod draws the settings dialog and the pet menu when opened with { panel }.
    if (panel() === "menu") {
      this.armed = null; // "kill" or "reply:<text>": the first click only arms it
      this.packs = [];
      loadPacks().then((k) => { this.packs = k; cx.notify(); });
    }
    if (panel()) return;
    this.size = { width: 0, height: OPEN };
    this.tick = 0;
    this.list = [];
    this.spots = {};
    this.held = {}; // address -> tick until which a dropped pet stays put
    this.drag = null; // { address, grab, trail }: the pet in hand, where it was grabbed, recent pointer samples
    this.moved = false; // the last press dragged, so its click doesn't count
    this.thrown = null; // the pet gliding after a throw
    this.hearts = {}; // address -> click number, while its hearts show
    this.said = {}; // dialogue memory, see pets.js
    this.last = {}; // address -> status last seen, to sound a change
    this.offset = 0; // pets scrolled past on the left, when more run than fit
    this.total = 0;
    this.wheelAt = 0;
    this.sel = null; // address of the pet the keyboard is on
    this.focus = cx.focus_handle();
    this.watch = {}; // address -> { sig, at, warned }: when each working screen last changed
    this.sigs = {}; // address -> hash of its screen at the last look
    this.stuck = new Set(); // addresses that look stuck now
    this.working = []; // addresses working at the last layout
    this.needs = []; // addresses blocked or errored at the last layout
    this.recap = { runs: {}, finished: [] };
    this.replies = [];
    loadReplies().then((r) => { this.replies = r; });
    cx.timer.every(STEP, (cx) => {
      this.tick += 1;
      if (this.tick % (POLL / STEP) === 0) this.poll(); // the beat is the only timer
      this.thrown = null;
      if (!prefs().on) return;
      this.layoutPets(true);
      cx.notify();
    });
  }

  // Look at each working terminal's screen; one that stays the same for STUCK looks stuck.
  poll() {
    const { on, stuck } = prefs();
    if (!on || !stuck) return;
    for (const address of this.working) {
      hc(["read", "--lines", "20", address]).then((r) => { if (r.code === 0) this.sigs[address] = hash(r.stdout ?? ""); }).catch(() => {});
    }
  }

  layoutPets(roam) {
    for (const [address, until] of Object.entries(this.held)) if (until <= this.tick) delete this.held[address];
    const { sound, muted, favs, spots, kinds, stuck, group } = prefs();
    const held = new Set(Object.keys(this.held));
    if (this.drag) held.add(this.drag.address);
    const now = Date.now();
    const all = collect(terminals(), agents(), spaces()).map((p) => ({ ...p, sig: this.sigs[p.address] }));
    // Always track statuses, so turning sound on later doesn't replay old changes.
    for (const p of transitions(this.last, all)) if (sound && !muted[p.address]) playSound(p.status === "done" ? "done" : "blocked");
    this.working = all.filter((p) => p.status === "working").map((p) => p.address);
    // Every blocked or errored agent, also those scrolled out of view, for the N key.
    this.needs = all.filter((p) => p.status === "blocked" || p.status === "error").map((p) => p.address).sort();
    // A pet with no screen reading yet can't be judged, so it stays out of the stuck watch.
    const watched = stuck ? all.filter((p) => p.sig !== undefined) : [];
    // One toast for everything that just crossed the limit, so a dozen quiet agents don't bury the screen.
    const quiet = track(this.watch, watched, now);
    if (quiet.length > 0) {
      notify({
        title: quiet.length === 1 ? "Agent may be stuck" : `${quiet.length} agents may be stuck`,
        body: `${quiet.map((p) => p.label).slice(0, 4).join(", ")}${quiet.length > 4 ? ", …" : ""}: nothing new on screen for ${runtime(STUCK)}`,
        level: "warning",
      });
    }
    this.stuck = new Set(watched.filter((p) => stalled(this.watch, p, now)).map((p) => p.address));
    const done = recap(this.recap, all, now);
    if (done) notify({ title: "All agents finished", body: done, level: "success" });
    // A favorite with a saved spot stays there.
    for (const p of all) {
      if (favs[p.address] && typeof spots[p.address] === "number" && p.address !== this.drag?.address) {
        this.spots[p.address] = { x: spots[p.address] };
        held.add(p.address);
      }
    }
    this.total = all.length;
    this.offset = Math.min(this.offset, Math.max(0, all.length - capacity(this.size.width)));
    const art = Object.fromEntries(Object.entries(kinds).filter(([, k]) => validKind(k)));
    this.list = place(all, this.spots, this.size.width, this.tick, roam, Math.random, held, { favs, offset: this.offset, kinds: art, said: this.said, group });
    // Before the first size report every spot clamps to the left edge; don't keep those.
    if (this.size.width > 0) this.spots = Object.fromEntries(this.list.map((p) => [p.address, { x: p.x }]));
  }

  drop(cx) {
    if (!this.drag) return;
    const { address, trail } = this.drag;
    if (this.moved) {
      const x = landing(trail);
      if (x !== null) {
        this.spots[address] = { x };
        this.thrown = address;
      }
      this.held[address] = this.tick + HOLD;
      // A favorite keeps where it was put.
      if (prefs().favs[address]) {
        const at = Math.min(Math.max(LEFT, this.spots[address].x), Math.max(LEFT, this.size.width - SLOT));
        save({ spots: { ...prefs().spots, [address]: Math.round(at) } });
      }
    }
    this.drag = null;
    cx.notify();
  }

  scroll(step, cx) {
    const next = Math.min(Math.max(0, this.offset + step), Math.max(0, this.total - capacity(this.size.width)));
    if (next === this.offset) return false;
    this.offset = next;
    this.layoutPets(false);
    cx.notify();
    return true;
  }

  // Arrows move between pets (left to right), Enter opens the agent, F stars, M opens the menu, N jumps to the next blocked one.
  key(e, cx) {
    const row = [...this.list].sort((a, b) => a.x - b.x);
    if (row.length === 0) return;
    const at = row.findIndex((p) => p.address === this.sel);
    const go = (i) => { this.sel = row[Math.min(Math.max(0, i), row.length - 1)].address; cx.notify(); };
    const pet = row[at];
    switch (e.keystroke) {
      case "right":
        if (at === row.length - 1 && this.scroll(1, cx)) return;
        return go(at + 1);
      case "left":
        if (at === 0 && this.scroll(-1, cx)) return;
        return go(at < 0 ? 0 : at - 1);
      case "home": return go(0);
      case "end": return go(row.length - 1);
      case "enter": return pet && run("agent.focus", { terminal: pet.address });
      case "f": return pet && toggleFav(pet.address, pet.x);
      case "m": case "menu": case "shift-f10": return pet && openMenu(pet, this.replies);
      case "n": {
        // Jump to the next agent that is blocked, and open it.
        if (this.needs.length === 0) return;
        const next = this.needs[(this.needs.indexOf(this.sel) + 1) % this.needs.length];
        this.sel = next;
        this.offset = 0; // blocked and errored pets sort first
        cx.notify();
        return run("agent.focus", { terminal: next });
      }
    }
  }

  render(_cx) {
    const t = pureBlack(theme());
    if (panel() === "settings") return settingsPanel(t);
    if (panel() === "menu") return menuPanel(t, this);
    const { on, color, favs, muted, colors } = prefs();
    const shut = this.size.height < OPEN / 2;
    if (on) this.layoutPets(false);
    // The dragged pet draws last, over the others.
    const lifted = this.drag?.address;
    const list = on ? [...this.list].sort((a, b) => (a.address === lifted) - (b.address === lifted)) : [];
    const cap = capacity(this.size.width);
    return div().id("root").size_full().relative().overflow_hidden().bg(t.chrome)
      .accessibility_label("Agent pets")
      .track_focus(this.focus)
      .on_size_change((size, cx) => {
        this.size = { width: size.width / zoom(), height: size.height / zoom() };
        cx.notify();
      })
      .on_mouse_down("left", () => this.focus.focus())
      .on_key_down((e, cx) => this.key(e, cx))
      .on_scroll_wheel((e, cx) => {
        const now = Date.now();
        const d = Math.abs(e.delta.x) > Math.abs(e.delta.y) ? e.delta.x : e.delta.y;
        if (!d || now - this.wheelAt < WHEEL) return;
        this.wheelAt = now;
        this.scroll(d > 0 ? 1 : -1, cx);
      })
      .on_mouse_move((e, cx) => {
        if (!this.drag) return;
        const x = e.local_position.x / zoom() - this.drag.grab;
        const now = Date.now();
        // The last 100 ms of movement decide how hard a release throws.
        this.drag.trail = [...this.drag.trail.filter((s) => now - s.t < 100), { x, t: now }];
        this.spots[this.drag.address] = { x };
        this.moved = true;
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => this.drop(cx))
      // Leaving the strip mid-drag drops the pet at the edge.
      .on_hover((hovered, cx) => { if (!hovered) this.drop(cx); })
      .child(controls(t, shut))
      .when(!shut && on && this.total > cap, (el) => el.child(pager(t, this, cap)))
      .when(!shut && (!on || list.length === 0), (el) => el.flex().items_center().justify_center()
        .child(div().text_xs().text_color(t.dim).child(on ? "No agents yet" : "Pets are off")))
      .when(!shut && on, (el) => el.children(dividers(list, t)).children(helperLines(list, t)))
      .when(!shut, (el) => el.children(list.map((p) => pet(p, t, this, COLORS.includes(colors[p.address]) ? colors[p.address] : color, favs[p.address], muted[p.address], this.stuck.has(p.address)))));
  }
}

// On a dark theme, surfaces go pure black; hover and selected stay a step lighter so they still show.
function pureBlack(t) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{1,2})?$/i.exec(String(t.chrome).trim());
  if (!m) return t;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (0.2126 * r + 0.7152 * g + 0.0722 * b >= 128) return t;
  return { ...t, chrome: "#000000", surface: "#000000", popover: "#000000", hover: "#1a1a1a", selected: "#1a1a1a" };
}

// The strip's node in the shown layout, so folding resizes only this block.
function stripId(node) {
  if (!node || typeof node !== "object") return null;
  if (node.content?.mod === MOD) return node.id;
  for (const child of [...(node.children ?? []), ...(node.floating ?? [])]) {
    const id = stripId(child);
    if (id) return id;
  }
  return null;
}

function fold(open) {
  const id = stripId(layout());
  if (id) run("layout.resize", { id, px: open ? OPEN : SHUT });
}

// The fold arrow and the settings gear, top left.
function controls(t, shut) {
  const button = (id, tip, onClick) => div().id(id).w(14).h(16).flex().items_center().justify_center()
    .rounded(3).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip).accessibility_label(tip).on_click(onClick);
  return h_flex().absolute().left(4).top(1).gap(2)
    .child(button("fold", shut ? "Show pets" : "Hide pets", () => fold(shut))
      .text_xs().line_height("16px").text_color(t.muted).child(shut ? "▴" : "▾"))
    .child(button("gear", "Pet settings", () => openOverlay({ mod: MOD, kind: "dialog", width: 300, height: 340, props: { panel: "settings" } }))
      .child(svg(`mods/${MOD}/gear.svg`).size(11).text_color(t.muted)));
}

// "‹ 2–5 / 9 ›" at the right end: which pets show when more run than fit. The wheel scrolls it too.
function pager(t, view, cap) {
  const step = (id, text, tip, by) => div().id(id).w(14).h(16).flex().items_center().justify_center().rounded(3)
    .cursor_pointer().hover((s) => s.bg(t.hover)).text_color(t.muted).tooltip(tip).accessibility_label(tip)
    .on_click((_e, cx) => view.scroll(by, cx)).child(text);
  const from = view.offset + 1;
  return h_flex().absolute().right(4).top(1).gap(2).items_center()
    .child(step("page-prev", "‹", "Earlier pets", -1))
    .child(div().text_xs().line_height("16px").text_color(t.dim).child(`${from}–${Math.min(view.total, view.offset + cap)} / ${view.total}`))
    .child(step("page-next", "›", "Later pets", 1));
}

// A line from each helper to the agent that started it, behind the pets.
function helperLines(list, t) {
  return links(list).filter((l) => l.w > 0).map((l, i) => div().id(`link-${i}`).absolute().top(36).left(l.x).w(l.w).h(1)
    .bg(t[l.status] ?? t.border).opacity(0.5)
    .transition("left", { duration: STEP, easing: "linear" }));
}

// A thin divider where one space's stretch of the strip ends and the next begins.
function dividers(list, t) {
  const starts = [...new Set(list.map((p) => p.seg?.lo).filter((lo) => lo > LEFT))];
  return starts.map((lo) => div().id(`divider-${lo}`).absolute().top(10).left(lo - 3).w(1).h(46).bg(t.border));
}

function settingsPanel(t) {
  const { on, color, sound, stuck, group } = prefs();
  const choice = (id, text, active, onClick) => div().id(id).px(10).h(24).flex().items_center().rounded(5)
    .cursor_pointer().border(1).border_color(active ? t.accent : t.border).bg(active ? t.selected : t.surface)
    .text_color(active ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).on_click(onClick).child(text);
  const toggle = (label, idOn, idOff, value, onSet) => h_flex().justify_between().items_center()
    .child(div().child(label))
    .child(h_flex().gap(6)
      .child(choice(idOn, "On", value, () => onSet(true)))
      .child(choice(idOff, "Off", !value, () => onSet(false))));
  return v_flex().id("panel").size_full().p(16).gap(14).text_size(13).text_color(t.foreground)
    .child(h_flex().justify_between().items_center()
      .child(div().font_semibold().child("Pets"))
      .child(div().id("close").px(6).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
        .on_click(() => closeOverlay(props().overlay)).child("✕")))
    // Off folds the strip away; on opens it again.
    .child(toggle("Show pets", "on", "off", on, (v) => { save({ on: v }); fold(v); }))
    .child(toggle("Sound when blocked or done", "sound-on", "sound-off", sound, (v) => save({ sound: v })))
    .child(toggle("Warn when an agent looks stuck", "stuck-on", "stuck-off", stuck, (v) => save({ stuck: v })))
    .child(toggle("Group pets by space", "group-on", "group-off", group, (v) => save({ group: v })))
    .child(v_flex().gap(8)
      .child(div().child("Color"))
      .child(h_flex().gap(8).items_center().children(COLORS.map((c) => swatch(c, c === color, t, () => save({ color: c }))))))
    .child(div().text_xs().text_color(t.dim)
      .child("Click a pet for hearts, double-click to open its agent, right-click for more. Drag to move it, flick to throw it. Keys: arrows, Enter, F to star, M for the menu, N for the next blocked agent."));
}

function swatch(c, active, t, onClick) {
  const el = div().id(`color-${c}`).h(20).rounded(10).cursor_pointer().border(2)
    .border_color(active ? t.foreground : t.border).on_click(onClick).tooltip(c === "status" ? "By status" : c);
  if (c !== "status") return el.w(20).bg(t[c]);
  // Status: a dot for each status color.
  return el.px(5).flex().items_center().gap(2)
    .children(["working", "blocked", "done", "idle"].map((s) => div().w(5).h(5).rounded(3).bg(t[s])));
}

// The right-click menu of one pet, a popup of this same mod.
function menuPanel(t, view) {
  const { address, label, x, replies = [] } = props();
  const { favs, muted, kinds, colors } = prefs();
  const row = (id, text, onClick, color = t.foreground) => div().id(id).h(26).px(8).flex().items_center().rounded(5)
    .cursor_pointer().text_color(color).hover((s) => s.bg(t.hover)).accessibility_label(text).on_click(onClick).child(text);
  const { pane, restart, cwd } = menuInfo(address);
  const arm = (key, run_) => (_e, cx) => {
    if (view.armed !== key) { view.armed = key; cx.notify(); return; }
    run_();
    closeOverlay(props().overlay);
  };
  const current = validKind(kinds[address]) ? kinds[address] : null;
  const own = COLORS.includes(colors[address]) ? colors[address] : null;
  const setColor = (c) => {
    const { [address]: _old, ...rest } = colors;
    save({ colors: c ? { ...colors, [address]: c } : rest });
    closeOverlay(props().overlay);
  };
  const cell = (k, content, tip) => div().id(`sprite-${k ?? "auto"}`).w(24).h(24).flex().items_center().justify_center().rounded(5)
    .cursor_pointer().border(1).border_color(k === current ? t.accent : t.border).bg(k === current ? t.selected : t.surface)
    .hover((s) => s.bg(t.hover)).tooltip(tip).accessibility_label(`Sprite ${tip}`)
    .on_click(() => {
      const { [address]: _old, ...rest } = kinds;
      save({ kinds: k ? { ...kinds, [address]: k } : rest });
      closeOverlay(props().overlay);
    }).child(content);
  return v_flex().id("menu").size_full().p(8).gap(2).text_size(13).text_color(t.foreground)
    .child(div().px(8).h(20).text_xs().truncate().text_color(t.dim).child(label))
    .child(row("focus", "Focus agent", () => { run("agent.focus", { terminal: address }); closeOverlay(props().overlay); }))
    .child(row("peek", "Peek", () => { run("terminal.peek", { terminal: address }); closeOverlay(props().overlay); }))
    .when(!pane, (el) => el.child(row("show", "Show as pane", () => { run("terminal.keep", { terminal: address }); closeOverlay(props().overlay); })))
    // Restart ends the agent and starts its program again in the same folder; its conversation is not kept, so it asks twice.
    .when(restart, (el) => el.child(row("restart", view.armed === "restart" ? "Really restart? Click again" : "Restart", arm("restart", () => {
      run("terminal.kill", { terminal: address });
      run("terminal.open", { argv: restart, ...(cwd ? { folder: cwd } : {}), place: "tab" });
    }), t.blocked)))
    // Killing ends the agent for good, so the first click only asks.
    .child(row("kill", view.armed === "kill" ? "Really kill? Click again" : "Kill", arm("kill", () => run("terminal.kill", { terminal: address })), t.blocked))
    // A reply types into a blocked agent's prompt, so each one asks twice. `--force` is what lets hc type into a blocked terminal.
    .children(replies.map((text, i) => row(`reply-${i}`, view.armed === `reply:${text}` ? `Send "${text}"? Click again` : `Reply "${text}"`,
      arm(`reply:${text}`, () => hc(["send", "--force", address, text])
        .then((r) => { if (r.code !== 0) notify({ title: "Reply not sent", body: String(r.stderr ?? "").slice(0, 120), level: "error" }); })
        .catch(() => notify({ title: "Reply not sent", level: "error" }))))))
    .child(row("mute", muted[address] ? "Unmute sounds" : "Mute sounds", () => { toggleMute(address); closeOverlay(props().overlay); }))
    .child(row("fav", favs[address] ? "Remove star" : "Star (keeps its spot)", () => { toggleFav(address, x ?? LEFT); closeOverlay(props().overlay); }))
    .child(div().px(8).pt(6).h(22).text_xs().text_color(t.dim).child("Color"))
    .child(h_flex().px(4).gap(4).flex_wrap().items_center()
      .child(div().id("color-auto").w(20).h(20).flex().items_center().justify_center().rounded(10).cursor_pointer()
        .border(2).border_color(own ? t.border : t.foreground).text_xs().text_color(t.muted).tooltip("Same as the others")
        .accessibility_label("Color: same as the others").on_click(() => setColor(null)).child("A"))
      .children(COLORS.map((c) => swatch(c, c === own, t, () => setColor(c)))))
    .child(div().px(8).pt(6).h(22).text_xs().text_color(t.dim).child("Sprite"))
    .child(h_flex().px(4).gap(4).flex_wrap()
      .child(cell(null, div().text_xs().text_color(t.muted).child("A"), "Automatic"))
      .children([...SPRITES, ...view.packs].map((k) => cell(k, svg(spritePath(k)).size(16).text_color(t.foreground), k))));
}

function pet(p, t, view, tint, fav, muted, stuck) {
  const color = (tint === "status" ? t[p.status] ?? (p.status === "error" ? t.blocked : undefined) : t[tint]) ?? t.foreground;
  const dragging = view.drag?.address === p.address;
  const loved = view.hearts[p.address] !== undefined;
  const selected = view.sel === p.address && view.focus.is_focused();
  const info = `${describe(p, Date.now())}${fav ? " · starred" : ""}${muted ? " · muted" : ""}${stuck ? " · screen unchanged for 10m+" : ""}`;

  // Each status moves one way: blocked bounces, done hops, working bobs as it walks, idle breathes.
  // A petted one bounces with hearts; one being dragged is lifted and holds still.
  const body = v_flex().id(`pet-body-${p.address}`).relative().top(dragging ? -6 : 0).w(SLOT).items_center()
    .cursor_grab().rounded(6).hover((s) => s.bg(t.hover))
    .when(selected, (el) => el.bg(t.selected))
    .tooltip(info)
    .accessibility_label(info)
    .on_mouse_down("left", (e, _cx) => {
      // Where on the pet it was grabbed, so it doesn't jump under the pointer.
      view.drag = { address: p.address, grab: (e.local_position?.x ?? SLOT / 2) / zoom(), trail: [] };
      view.moved = false;
      view.sel = p.address;
    })
    .on_mouse_down("right", () => openMenu(p, view.replies))
    .on_click((e, cx) => {
      if (view.moved) return;
      if (e.click_count >= 2) return run("agent.focus", { terminal: p.address });
      const n = (view.hearts[p.address] ?? 0) + 1;
      view.hearts[p.address] = n;
      cx.notify();
      cx.timer.after(HEARTS, (cx) => {
        if (view.hearts[p.address] === n) delete view.hearts[p.address];
        cx.notify();
      });
    })
    .child(loved ? hearts(t) : p.say ? bubble(p.say, t) : stuck ? bubble("still on it?", t) : badge(p, t))
    .child(sprite(p, color))
    // How far along the agent says it is.
    .when(p.progress !== null && p.progress !== undefined, (el) => el.child(
      div().w(PET).h(3).rounded(1).bg(t.border).child(div().h(3).w((PET * p.progress) / 100).rounded(1).bg(color))))
    .child(div().w(SLOT).h(LABEL).text_xs().line_height(`${LABEL}px`).text_center().truncate().text_color(t.muted)
      .child(fav ? `★ ${p.label}` : p.label));
  const moving = dragging ? null : loved ? (el) => el.loop("top", { from: 0, to: -6, period: 360 }) : {
    blocked: (el) => el.loop("top", { from: 0, to: -8, period: 500 }),
    done: (el) => el.loop("top", { from: 0, to: -5, period: 1100 }),
    working: (el) => el.loop("top", { from: 0, to: -2, period: 400 }),
    idle: (el) => el.loop("opacity", { from: 0.5, to: 0.8, period: 3200 }),
    error: (el) => el.loop("opacity", { from: 0.4, to: 1, period: 800 }),
  }[p.status];

  // The spot changes every STEP; the slide takes as long, so a roaming pet keeps walking.
  // A pet in hand keeps up with the pointer, a thrown one glides and slows to land,
  // and a blocked or errored one runs to the front.
  const glide = dragging ? { duration: 30, easing: "linear" }
    : view.thrown === p.address ? { duration: 800, easing: "ease-out" }
    : p.status === "blocked" || p.status === "error" ? { duration: 700, easing: "ease-out" }
    : { duration: STEP, easing: "linear" };
  return v_flex().id(`pet-${p.address}`).absolute().top(0).h_full().w(SLOT).left(p.x).justify_end().pb(2)
    .transition("left", glide)
    .child(moving ? moving(body) : body);
}

// The creature with lids over its eye holes: they blink now and then, and stay shut while it sleeps.
function sprite(p, color) {
  const eyes = EYES[p.kind];
  const k = PET / (eyes?.grid ?? 16);
  return div().relative().w(PET).h(PET)
    .child(svg(spritePath(p.kind)).w(PET).h(PET).text_color(color))
    .children((eyes?.at ?? []).map(([x, y, w, h]) => {
      const lid = div().absolute().left(0).w(w * k).h(h * k).bg(color);
      return div().absolute().left(x * k).top(y * k).w(w * k).h(h * k).overflow_hidden()
        // The lid swings from far above and only reaches the eye at the end of each swing: a quick blink.
        .child(p.status === "idle" ? lid.top(0)
          : lid.loop("top", { from: -16 * h * k, to: 0, period: 2600 + (p.seed % 2400), easing: "linear" }));
    }));
}

function hearts(t) {
  return div().h(BADGE).text_xs().line_height(`${BADGE}px`).text_color(t.ansi5 ?? t.blocked)
    .frames(["♥", "♥ ♥", "♥ ♥ ♥"], 260);
}

// A speech bubble in the badge row, wider than the pet, so a short line fits.
function bubble(text, t) {
  return div().h(BADGE).relative().w(SLOT).child(
    div().absolute().top(0).left(-22).w(SLOT + 44).h(BADGE).flex().justify_center().child(
      div().px(4).h(BADGE).rounded(4).bg(t.popover).border(1).border_color(t.border)
        .text_xs().line_height(`${BADGE - 2}px`).text_color(t.foreground).whitespace_nowrap().child(text)));
}

function badge(p, t) {
  const el = div().h(BADGE).text_xs().font_bold().line_height(`${BADGE}px`);
  if (p.status === "blocked") return el.text_color(t.blocked).child("!");
  if (p.status === "error") return el.text_color(t.blocked).child("✗");
  if (p.status === "done") return el.text_color(t.done).child("✓");
  if (p.status === "idle") return el.text_color(t.dim).frames(["z", "zz", "zzz"], 700);
  return el;
}
