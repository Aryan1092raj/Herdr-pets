import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, theme, run, settings, layout, props, shared, setShared, openOverlay, closeOverlay } from "herdr";
import { collect, place, landing, PET, SLOT } from "./pets.js";

// The folder name under ~/.config/herdr-app/mods: svg paths start at the app home.
const MOD = "herdr-pets";
const BADGE = 12;
const LABEL = 12;
const OPEN = 64; // strip height, px
const SHUT = 18; // folded: just the arrow and the gear
const STEP = 3000; // ms between new spots for roaming pets
const HOLD = 2; // beats a dropped pet stays put before it carries on
const HEARTS = 1600; // ms of hearts after a click
// Colors the settings offer, as theme names so they follow the theme. "status" colors each pet by its status.
const COLORS = ["status", "accent", "ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];

// Eye holes of each sprite in its own grid, [x, y, w, h]. Lids slide down over them to blink.
const EYES = {
  blob: { grid: 16, at: [[5, 5, 1, 2], [10, 5, 1, 2]] },
  cat: { grid: 16, at: [[6, 5, 1, 2], [9, 5, 1, 2]] },
  ghost: { grid: 16, at: [[5, 6, 1, 1], [10, 6, 1, 1]] },
  bot: { grid: 16, at: [[4, 6, 1, 1], [7, 6, 2, 1], [11, 6, 1, 1]] },
  "claude-code": { grid: 24, at: [[6, 12.1, 1.5, 2.85], [16.5, 12.1, 1.5, 2.85]] },
  "codex-openai": { grid: 24, at: [[5.3, 7.9, 4.5, 8.4], [11.8, 14.4, 6.7, 2]] },
};

// shortcut: herdr-app 0.1.10 reports sizes and pointer positions before its zoom while layout units are zoomed; drop the division if a later version reports zoomed values.
const zoom = () => Number(settings().zoom) || 1;

// The person's choices, shared by the strip and its settings dialog and kept across restarts.
function prefs() {
  const p = shared(MOD) ?? {};
  return { on: p.on !== false, color: COLORS.includes(p.color) ? p.color : "status" };
}

const isPanel = () => props()?.panel === "settings";

export default class Pets extends View {
  init(_props, cx) {
    // The same mod draws the settings dialog when opened with { panel: "settings" }.
    if (isPanel()) return;
    this.size = { width: 0, height: OPEN };
    this.tick = 0;
    this.list = [];
    this.spots = {};
    this.held = {}; // address -> tick until which a dropped pet stays put
    this.drag = null; // { address, grab, trail }: the pet in hand, where it was grabbed, recent pointer samples
    this.moved = false; // the last press dragged, so its click doesn't count
    this.thrown = null; // the pet gliding after a throw
    this.hearts = {}; // address -> click number, while its hearts show
    cx.timer.every(STEP, (cx) => {
      this.tick += 1;
      this.thrown = null;
      if (!prefs().on) return;
      this.layoutPets(true);
      cx.notify();
    });
  }

  layoutPets(roam) {
    for (const [address, until] of Object.entries(this.held)) if (until <= this.tick) delete this.held[address];
    const held = new Set(Object.keys(this.held));
    if (this.drag) held.add(this.drag.address);
    this.list = place(collect(terminals(), agents()), this.spots, this.size.width, this.tick, roam, Math.random, held);
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
    }
    this.drag = null;
    cx.notify();
  }

  render(_cx) {
    const t = theme();
    if (isPanel()) return settingsPanel(t);
    const { on, color } = prefs();
    const shut = this.size.height < OPEN / 2;
    if (on) this.layoutPets(false);
    // The dragged pet draws last, over the others.
    const lifted = this.drag?.address;
    const list = on ? [...this.list].sort((a, b) => (a.address === lifted) - (b.address === lifted)) : [];
    return div().id("root").size_full().relative().overflow_hidden().bg(t.chrome)
      .on_size_change((size, cx) => {
        this.size = { width: size.width / zoom(), height: size.height / zoom() };
        cx.notify();
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
      .when(!shut && (!on || list.length === 0), (el) => el.flex().items_center().justify_center()
        .child(div().text_xs().text_color(t.dim).child(on ? "No agents yet" : "Pets are off")))
      .when(!shut, (el) => el.children(list.map((p) => pet(p, t, this, color))));
  }
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
    .rounded(3).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip).on_click(onClick);
  return h_flex().absolute().left(4).top(1).gap(2)
    .child(button("fold", shut ? "Show pets" : "Hide pets", () => fold(shut))
      .text_xs().line_height("16px").text_color(t.muted).child(shut ? "▴" : "▾"))
    .child(button("gear", "Pet settings", () => openOverlay({ mod: MOD, kind: "dialog", width: 300, height: 210, props: { panel: "settings" } }))
      .child(svg("mods/workspace-chrome/settings.svg").size(11).text_color(t.muted)));
}

function settingsPanel(t) {
  const { on, color } = prefs();
  const set = (next) => setShared(MOD, { ...prefs(), ...next });
  const choice = (id, text, active, onClick) => div().id(id).px(10).h(24).flex().items_center().rounded(5)
    .cursor_pointer().border(1).border_color(active ? t.accent : t.border).bg(active ? t.selected : t.surface)
    .text_color(active ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).on_click(onClick).child(text);
  return v_flex().id("panel").size_full().p(16).gap(14).text_size(13).text_color(t.foreground)
    .child(h_flex().justify_between().items_center()
      .child(div().font_semibold().child("Pets"))
      .child(div().id("close").px(6).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
        .on_click(() => closeOverlay(props().overlay)).child("✕")))
    .child(h_flex().justify_between().items_center()
      .child(div().child("Show pets"))
      .child(h_flex().gap(6)
        // Off folds the strip away; on opens it again.
        .child(choice("on", "On", on, () => { set({ on: true }); fold(true); }))
        .child(choice("off", "Off", !on, () => { set({ on: false }); fold(false); }))))
    .child(v_flex().gap(8)
      .child(div().child("Color"))
      .child(h_flex().gap(8).items_center().children(COLORS.map((c) => swatch(c, c === color, t, () => set({ color: c }))))))
    .child(div().text_xs().text_color(t.dim)
      .child("Click a pet for hearts, double-click to open its agent. Drag to move it, flick to throw it."));
}

function swatch(c, active, t, onClick) {
  const el = div().id(`color-${c}`).h(20).rounded(10).cursor_pointer().border(2)
    .border_color(active ? t.foreground : t.border).on_click(onClick).tooltip(c === "status" ? "By status" : c);
  if (c !== "status") return el.w(20).bg(t[c]);
  // Status: a dot for each status color.
  return el.px(5).flex().items_center().gap(2)
    .children(["working", "blocked", "done", "idle"].map((s) => div().w(5).h(5).rounded(3).bg(t[s])));
}

function pet(p, t, view, tint) {
  const color = (tint === "status" ? t[p.status] : t[tint]) ?? t.foreground;
  const dragging = view.drag?.address === p.address;
  const loved = view.hearts[p.address] !== undefined;

  // Each status moves one way: blocked bounces, done hops, working bobs as it walks, idle breathes.
  // A petted one bounces with hearts; one being dragged is lifted and holds still.
  const body = v_flex().id(`pet-body-${p.address}`).relative().top(dragging ? -6 : 0).w(SLOT).items_center()
    .cursor_grab().rounded(6).hover((s) => s.bg(t.hover))
    .tooltip(`${p.label}: ${p.status}`)
    .on_mouse_down("left", (e, _cx) => {
      // Where on the pet it was grabbed, so it doesn't jump under the pointer.
      view.drag = { address: p.address, grab: (e.local_position?.x ?? SLOT / 2) / zoom(), trail: [] };
      view.moved = false;
    })
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
    .child(loved ? hearts(t) : p.say ? bubble(p.say, t) : badge(p, t))
    .child(sprite(p, color))
    .child(div().w(SLOT).h(LABEL).text_xs().line_height(`${LABEL}px`).text_center().truncate().text_color(t.muted).child(p.label));
  const moving = dragging ? null : loved ? (el) => el.loop("top", { from: 0, to: -6, period: 360 }) : {
    blocked: (el) => el.loop("top", { from: 0, to: -8, period: 500 }),
    done: (el) => el.loop("top", { from: 0, to: -5, period: 1100 }),
    working: (el) => el.loop("top", { from: 0, to: -2, period: 400 }),
    idle: (el) => el.loop("opacity", { from: 0.5, to: 0.8, period: 3200 }),
  }[p.status];

  // The spot changes every STEP; the slide takes as long, so a roaming pet keeps walking.
  // A pet in hand keeps up with the pointer, a thrown one glides and slows to land,
  // and a blocked one runs to the front.
  const glide = dragging ? { duration: 30, easing: "linear" }
    : view.thrown === p.address ? { duration: 800, easing: "ease-out" }
    : p.status === "blocked" ? { duration: 700, easing: "ease-out" }
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
    .child(svg(`mods/${MOD}/${p.kind}.svg`).w(PET).h(PET).text_color(color))
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
  if (p.status === "done") return el.text_color(t.done).child("✓");
  if (p.status === "idle") return el.text_color(t.dim).frames(["z", "zz", "zzz"], 700);
  return el;
}
