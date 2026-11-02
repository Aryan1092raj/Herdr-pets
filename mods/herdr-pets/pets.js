// Placement and dialogue logic with no herdr or gpui imports, so `node --test` can run it.

export const KINDS = ["blob", "cat", "ghost", "bot"];
// Creatures only a person can pick (the automatic choice stays within KINDS, so existing pets keep their art).
export const EXTRA = ["frog", "owl", "bunny", "spike"];
export const SPRITES = [...KINDS, ...EXTRA, "claude-code", "codex-openai"];
// Agents whose app is known get their own creature; every other agent gets one of KINDS.
const APP_KINDS = [[/^claude/, "claude-code"], [/^codex/, "codex-openai"]];
export const PET = 28; // sprite size, px
export const SLOT = 56; // width one pet takes on the strip, px
export const LEFT = 40; // room for the fold arrow and the settings gear
const SHUFFLE = 60; // how far an idle pet wanders in one beat, px
const WANDER = 160; // how far a roaming pet walks in one beat, px: keeps them strolling
const THROW = 0.3; // release speed that counts as a throw, px/ms
const GLIDE = 400; // a thrown pet carries on for this many ms worth of its speed

const ORDER = { blocked: 0, error: 0, done: 1, working: 2, idle: 3 };
// Pets that need the person: they run to the front.
const NEEDS = (status) => status === "blocked" || status === "error";
const REMEMBER = 4; // lines a pet won't repeat until it has said this many others
// "{name}" becomes the helper's label.
export const ASK = ["how's it going?", "need anything?", "status?", "all good?", "{name}, how's it looking?", "any news?", "shout if you're stuck", "how far along?"];
export const ANSWER = {
  working: ["on it…", "almost there", "reading files", "running tests", "making progress", "checking the diff", "one more thing…", "nearly through"],
  blocked: ["stuck, help?", "need a hand", "waiting on you", "blocked, sorry"],
  done: ["done ✓", "all finished", "that's a wrap", "finished, check it?"],
  idle: ["waiting…", "nothing to do", "just resting", "ready when you are"],
};
export const REPLY = {
  blocked: ["on my way", "coming!", "hold on, {name}", "let me look"],
  done: ["nice!", "good job, {name}", "thanks!", "great work"],
};

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

// How many pets fit on a strip of this width.
export const capacity = (width) => Math.max(1, Math.floor((width - LEFT) / SLOT));

// "45s", "3m 12s", "1h 5m".
export function runtime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// Tooltip and screen-reader text: name, status (with how long it has been working), and the agent's task.
export function describe(p, now) {
  const status = p.status === "working" && p.since ? `working ${runtime(now - p.since)}` : p.status;
  const text = p.note || p.title;
  const task = text && text !== p.label ? text.slice(0, 80) : null;
  const detail = [p.why ? `needs ${p.why}` : null, p.progress !== null && p.progress !== undefined ? `${p.progress}%` : null].filter(Boolean).join(", ");
  return [p.label, detail ? `${status} (${detail})` : status, task].filter(Boolean).join(" · ");
}

// Pets that just turned blocked or done, given the statuses seen last time (updated in place).
// A pet seen for the first time is not a change, so a restart stays quiet.
export function transitions(last, list) {
  const hit = [];
  for (const p of list) {
    if (last[p.address] && last[p.address] !== p.status && (NEEDS(p.status) || p.status === "done")) hit.push(p);
    last[p.address] = p.status;
  }
  return hit;
}

export const STUCK = 10 * 60_000; // ms of an unchanged screen while working before a pet looks stuck

// Follows each working pet's screen signature `sig` (a hash the strip takes of its terminal now and then).
// `watch` maps address -> { sig, at, warned } and is updated in place; the result is the pets that
// just crossed `limit` with the same screen, once each.
export function track(watch, list, now, limit = STUCK) {
  const alive = new Set(list.map((p) => p.address));
  for (const a of Object.keys(watch)) if (!alive.has(a)) delete watch[a];
  const hit = [];
  for (const p of list) {
    const w = watch[p.address];
    if (!w || w.sig !== p.sig || p.status !== "working") watch[p.address] = { sig: p.sig, at: now, warned: false };
    else if (now - w.at >= limit && !w.warned) {
      w.warned = true;
      hit.push(p);
    }
  }
  return hit;
}

// Whether a working pet's screen has been still for `limit`.
export const stalled = (watch, p, now, limit = STUCK) => p.status === "working" && !!watch[p.address] && now - watch[p.address].at >= limit;

// A message when a batch of agents has all finished, else null. `state` is { runs, finished }, updated in place:
// a pet is active while working, blocked or errored, and counts as finished once it settles into done or idle.
export function recap(state, list, now) {
  const active = new Set();
  for (const p of list) {
    if (p.status !== "working" && !NEEDS(p.status)) continue;
    active.add(p.address);
    state.runs[p.address] ??= p.since ?? now;
  }
  for (const [address, start] of Object.entries(state.runs)) {
    if (active.has(address)) continue;
    if (list.some((p) => p.address === address)) state.finished.push(now - start);
    delete state.runs[address];
  }
  if (active.size > 0) return null;
  const done = state.finished;
  state.finished = [];
  return done.length >= 2 ? `${done.length} agents finished, longest ${runtime(Math.max(...done))}` : null;
}

// Where to draw the line between each helper and its parent: from the left end, and how long.
export function links(list) {
  const byId = new Map(list.map((p) => [p.address, p]));
  return list.filter((c) => byId.has(c.parent)).map((c) => {
    const a = byId.get(c.parent).x + SLOT / 2;
    const b = c.x + SLOT / 2;
    return { x: Math.min(a, b), w: Math.abs(a - b), status: c.status };
  });
}

// A line from `bank` for `who` that isn't among its last few. The pick holds for the whole tick,
// so redraws don't change the bubble. `said` is the memory: address -> { tick, line, recent }.
function pick(bank, who, tick, said, name) {
  const m = (said[who] ??= { tick: -1, line: "", recent: [] });
  if (m.tick !== tick) {
    let i = (tick + hash(who)) % bank.length;
    for (let n = 0; n < bank.length && m.recent.includes(bank[i]); n++) i = (i + 1) % bank.length;
    m.line = bank[i];
    m.tick = tick;
    m.recent = [...m.recent, bank[i]].slice(-Math.min(REMEMBER, bank.length - 1));
  }
  return m.line.replace("{name}", name);
}

// Every live terminal whose program reports a status, from `terminals()` (hc ls),
// named by its space when it has a pane (`agents()`), else by its hc name.
// The app comes from the program's own report (OSC 7501 `app`, e.g. "claude-code"),
// else the app's program table key (e.g. "claude"), else hc's `agent` word.
// `title` is the agent's task as its terminal title; `since` is when its tab began working (from `spaces`).
export function collect(terminals, agents, spaces = []) {
  const space = new Map(agents.map((a) => [a.address, a.space_name || a.tab_name]));
  const title = new Map(agents.map((a) => [a.address, { text: a.title || null, tab: a.tab }]));
  const working = new Map(spaces.flatMap((s) => s.tabs ?? []).map((t) => [t.id, t.working_since]));
  const live = terminals.filter((t) => t.status && t.state !== "exited" && t.state !== "finished");
  const ids = new Set(live.map((t) => t.address));
  // A helper without a pane belongs to its parent's space.
  const spaceOf = new Map(agents.map((a) => [a.address, a.space]));
  const byAddress = new Map(live.map((t) => [t.address, t]));
  const group = (t, depth = 0) => spaceOf.get(t.address) ?? (depth < 8 && byAddress.has(t.parent) ? group(byAddress.get(t.parent), depth + 1) : "");
  return live.map((t) => ({
    address: t.address,
    status: t.status,
    app: t.report?.app ?? t.program?.key ?? t.agent ?? null,
    label: space.get(t.address) || t.name || t.agent || t.address,
    parent: ids.has(t.parent) ? t.parent : null,
    title: title.get(t.address)?.text ?? null,
    since: t.status === "working" ? working.get(title.get(t.address)?.tab) ?? null : null,
    group: group(t),
    // From the agent's own report (OSC 7501): its words for the task, how far along it is (0-100), and why it is blocked.
    note: typeof t.report?.msg === "string" && t.report.msg ? t.report.msg : null,
    progress: Number.isFinite(t.report?.progress) ? Math.min(100, Math.max(0, Math.round(t.report.progress))) : null,
    why: typeof t.report?.kind === "string" ? t.report.kind : null,
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
//
// `opts`: `favs` ({address: true}) sorts favorites right after blocked pets; `offset` scrolls
// the strip when more pets run than fit; `kinds` ({address: sprite}) overrides the art;
// `said` is the dialogue memory (see `pick`); `group` gives each space its own stretch of the
// strip (sized by how many pets it has), and every pet then carries its stretch as `seg`.
export function place(list, prev, width, tick, roam, rand = Math.random, held = new Set(), opts = {}) {
  const { favs = {}, offset = 0, kinds = {}, said = {}, group = false } = opts;
  const maxX = Math.max(LEFT, width - SLOT);
  const byId = new Map(list.map((p) => [p.address, p]));
  const max = capacity(width);
  const rank = (p) => (NEEDS(p.status) ? 0 : favs[p.address] ? 1 : 2 + (ORDER[p.status] ?? 4));
  const start = Math.min(Math.max(0, offset), Math.max(0, list.length - max));
  const shown = [...list]
    .sort((a, b) => rank(a) - rank(b) || a.address.localeCompare(b.address))
    .slice(start, start + max);
  const out = new Map();
  const phase = tick % 3; // 0: walk to parent, 1: chat, 2: wander

  const childrenOf = (id) => shown.filter((c) => c.parent === id);
  // Each pet's stretch of the strip [lo, hi]: all of it, or its space's share when grouped.
  const segOf = new Map(shown.map((p) => [p.address, { lo: LEFT, hi: maxX }]));
  if (group && shown.length > 0) {
    const keys = [...new Set(shown.map((p) => p.group ?? ""))].sort();
    const avail = maxX + SLOT - LEFT;
    let before = 0;
    for (const key of keys) {
      const members = shown.filter((p) => (p.group ?? "") === key);
      const lo = LEFT + Math.round((before * avail) / shown.length);
      const end = LEFT + Math.round(((before + members.length) * avail) / shown.length);
      for (const m of members) segOf.set(m.address, { lo, hi: Math.max(lo, end - SLOT) });
      before += members.length;
    }
  }
  const front = new Map(); // stretch start -> blocked pets already at its front
  // Parents before children (any depth), so a child can stand next to where its parent is now.
  const depth = (p, seen = 0) => (byId.has(p.parent) && seen < list.length ? 1 + depth(byId.get(p.parent), seen + 1) : 0);
  for (const p of [...shown].sort((a, b) => depth(a) - depth(b))) {
    const seed = hash(p.address);
    const kids = childrenOf(p.address);
    const parent = out.get(p.parent);
    const seg = segOf.get(p.address);
    const clamp = (x) => Math.min(seg.hi, Math.max(seg.lo, Math.round(x)));
    const was = prev[p.address]?.x ?? clamp(seg.lo + (seed % (seg.hi - seg.lo + 1)));
    let x = was;
    let meet = false;
    if (held.has(p.address)) {
      // Left where the person put it.
    } else if (parent) {
      const beside = parent.x + SLOT <= seg.hi ? parent.x + SLOT : parent.x - SLOT;
      if (p.status !== "working") {
        x = beside;
        meet = true;
      } else if (phase === 0 || phase === 1) {
        x = beside;
        meet = phase === 1;
      } else if (roam) {
        x = was + (rand() * 2 - 1) * WANDER;
      }
    } else if (NEEDS(p.status)) {
      x = seg.lo + (front.get(seg.lo) ?? 0) * SLOT;
      front.set(seg.lo, (front.get(seg.lo) ?? 0) + 1);
    } else if (roam && !(phase !== 2 && kids.some((c) => c.status === "working"))) {
      // A parent holds still while a working child walks over to chat.
      x = was + (rand() * 2 - 1) * (p.status === "idle" ? SHUFFLE : WANDER);
    }
    out.set(p.address, {
      ...p,
      seed,
      kind: kinds[p.address] ?? kindFor(p.app, seed),
      x: clamp(x),
      seg: group ? seg : null,
      meet,
      say: null,
    });
  }

  // Dialogue: a meeting child answers from its real status, and its parent speaks first.
  for (const c of out.values()) {
    if (!c.meet) continue;
    const parent = out.get(c.parent);
    c.say = pick(ANSWER[c.status] ?? ANSWER.idle, c.address, tick, said, parent.label);
    if (!parent.say) parent.say = pick(REPLY[c.status] ?? ASK, parent.address, tick, said, c.label);
  }
  return [...out.values()];
}
