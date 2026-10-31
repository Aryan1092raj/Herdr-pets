// Placement and dialogue logic with no herdr or gpui imports, so `node --test` can run it.

export const KINDS = ["blob", "cat", "ghost", "bot"];
// Agents whose app is known get their own creature; every other agent gets one of KINDS.
const APP_KINDS = [[/^claude/, "claude-code"], [/^codex/, "codex-openai"]];
export const PET = 28; // sprite size, px
export const SLOT = 56; // width one pet takes on the strip, px
export const LEFT = 40; // room for the fold arrow and the settings gear
const SHUFFLE = 60; // how far an idle pet wanders in one beat, px
const THROW = 0.3; // release speed that counts as a throw, px/ms
const GLIDE = 400; // a thrown pet carries on for this many ms worth of its speed

const ORDER = { blocked: 0, done: 1, working: 2, idle: 3 };
const ASK = ["how's it going?", "need anything?", "status?", "all good?"];
const ANSWER = {
  working: ["on it…", "almost there", "reading files", "running tests"],
  blocked: ["stuck, help?"],
  done: ["done ✓"],
  idle: ["waiting…"],
};
const REPLY = { blocked: "on my way", done: "nice!" };

// FNV-1a: the same address always gets the same art and starting spot.
export function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

export function kindFor(app, seed) {
  const hit = APP_KINDS.find(([re]) => re.test(app ?? ""));
  return hit ? hit[1] : KINDS[seed % KINDS.length];
}

// Every live terminal whose program reports a status, from `terminals()` (hc ls),
// named by its space when it has a pane (`agents()`), else by its hc name.
// The app comes from the program's own report (OSC 7501 `app`, e.g. "claude-code"),
// else the app's program table key (e.g. "claude"), else hc's `agent` word.
export function collect(terminals, agents) {
  const space = new Map(agents.map((a) => [a.address, a.space_name || a.tab_name]));
  const live = terminals.filter((t) => t.status && t.state !== "exited" && t.state !== "finished");
  const ids = new Set(live.map((t) => t.address));
  return live.map((t) => ({
    address: t.address,
    status: t.status,
    app: t.report?.app ?? t.program?.key ?? t.agent ?? null,
    label: space.get(t.address) || t.name || t.agent || t.address,
    parent: ids.has(t.parent) ? t.parent : null,
  }));
}

// Where a released pet lands, from its last pointer samples [{x, t}]: a fast release
// throws it on in that direction; a slow one leaves it where it was dropped (null).
export function landing(trail) {
  if (trail.length < 2) return null;
  const a = trail[0];
  const b = trail[trail.length - 1];
  if (b.t <= a.t) return null;
  const speed = (b.x - a.x) / (b.t - a.t);
  return Math.abs(speed) > THROW ? b.x + speed * GLIDE : null;
}

// Where each pet stands and what it says. `prev` maps address to the last {x}.
// With `roam`, pets pick new spots: anywhere for most, a short shuffle when idle.
// Otherwise they keep theirs, so a redraw for new data doesn't make them jump.
//
// Children (started by another agent through hc) cycle every three ticks:
// walk to their parent, chat beside it, wander off. Blocked or done children
// go to their parent and stay. Blocked pets without a parent run to the front.
// Pets in `held` (being dragged, or just dropped) stay at their previous spot.
export function place(list, prev, width, tick, roam, rand = Math.random, held = new Set()) {
  const maxX = Math.max(LEFT, width - SLOT);
  const clamp = (x) => Math.min(maxX, Math.max(LEFT, Math.round(x)));
  const byId = new Map(list.map((p) => [p.address, p]));
  const max = Math.max(1, Math.floor((width - LEFT) / SLOT));
  const shown = [...list]
    .sort((a, b) => (ORDER[a.status] ?? 4) - (ORDER[b.status] ?? 4) || a.address.localeCompare(b.address))
    .slice(0, max);
  const out = new Map();
  const phase = tick % 3; // 0: walk to parent, 1: chat, 2: wander

  const childrenOf = (id) => shown.filter((c) => c.parent === id);
  let front = 0;
  // Parents before children (any depth), so a child can stand next to where its parent is now.
  const depth = (p, seen = 0) => (byId.has(p.parent) && seen < list.length ? 1 + depth(byId.get(p.parent), seen + 1) : 0);
  for (const p of [...shown].sort((a, b) => depth(a) - depth(b))) {
    const seed = hash(p.address);
    const kids = childrenOf(p.address);
    const parent = out.get(p.parent);
    const was = prev[p.address]?.x ?? clamp(LEFT + (seed % (maxX - LEFT + 1)));
    let x = was;
    let meet = false;
    if (held.has(p.address)) {
      // Left where the person put it.
    } else if (parent) {
      const beside = parent.x + SLOT <= maxX ? parent.x + SLOT : parent.x - SLOT;
      if (p.status !== "working") {
        x = beside;
        meet = true;
      } else if (phase === 0 || phase === 1) {
        x = beside;
        meet = phase === 1;
      } else if (roam) {
        x = LEFT + rand() * (maxX - LEFT);
      }
    } else if (p.status === "blocked") {
      x = LEFT + front++ * SLOT;
    } else if (roam && !(phase !== 2 && kids.some((c) => c.status === "working"))) {
      // A parent holds still while a working child walks over to chat.
      x = p.status === "idle" ? was + (rand() * 2 - 1) * SHUFFLE : LEFT + rand() * (maxX - LEFT);
    }
    out.set(p.address, {
      ...p,
      seed,
      kind: kindFor(p.app, seed),
      x: clamp(x),
      meet,
      say: null,
    });
  }

  // Dialogue: a meeting child answers from its real status, and its parent speaks first.
  for (const c of out.values()) {
    if (!c.meet) continue;
    const parent = out.get(c.parent);
    const lines = ANSWER[c.status] ?? ANSWER.idle;
    c.say = lines[(tick + c.seed) % lines.length];
    if (!parent.say) parent.say = REPLY[c.status] ?? ASK[(tick + parent.seed) % ASK.length];
  }
  return [...out.values()];
}
