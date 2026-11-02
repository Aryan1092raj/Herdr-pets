import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hash, collect, place, kindFor, landing, runtime, describe, transitions, capacity,
  KINDS, EXTRA, SPRITES, ANSWER, REPLY, SLOT, LEFT,
} from "../mods/herdr-pets/pets.js";

const terminal = (address, status, extra = {}) => ({ address, status, name: address, ...extra });
const agents = (list, prev = {}, width = 600, tick = 0, roam = false) =>
  place(list, prev, width, tick, roam, () => 0.5);

test("hash is stable and maps the same address to the same kind", () => {
  assert.equal(hash("t1q"), hash("t1q"));
  assert.equal(hash(""), 2166136261);
  const [pet] = agents([{ address: "t1q", status: "idle" }]);
  assert.equal(pet.kind, KINDS[hash("t1q") % KINDS.length]);
});

test("collect keeps only live terminals with status and resolves labels", () => {
  const out = collect(
    [
      terminal("space", "working", { name: "hc-space" }),
      terminal("plain", "blocked", { name: "hc-plain" }),
      terminal("no-status", "", { name: "ignored" }),
      terminal("exited", "done", { state: "exited" }),
      terminal("finished", "idle", { state: "finished" }),
    ],
    [
      { address: "space", space_name: "The Space" },
      { address: "plain", space_name: "" },
    ],
  );

  assert.deepEqual(out, [
    { address: "space", status: "working", app: null, label: "The Space", parent: null, title: null, since: null },
    { address: "plain", status: "blocked", app: null, label: "hc-plain", parent: null, title: null, since: null },
  ]);
});

test("collect drops parent ids that are not among the live terminals", () => {
  const out = collect(
    [terminal("child", "working", { parent: "missing" })],
    [],
  );
  assert.equal(out[0].parent, null);
});

test("every placed x stays inside the visible strip", () => {
  const out = agents([
    { address: "blocked", status: "blocked" },
    { address: "working", status: "working" },
    { address: "idle", status: "idle" },
  ], { blocked: { x: -100 }, working: { x: 10000 }, idle: { x: 20 } }, 300, 2, true);

  assert.ok(out.every(({ x }) => x >= LEFT && x <= 300 - SLOT));
});

test("a non-roaming working pet keeps its previous x", () => {
  const [pet] = agents(
    [{ address: "worker", status: "working" }],
    { worker: { x: 177 } },
    500,
    4,
    false,
  );
  assert.equal(pet.x, 177);
});

test("blocked root pets line up from LEFT in address order", () => {
  const out = agents([
    { address: "c", status: "blocked" },
    { address: "a", status: "blocked" },
    { address: "b", status: "blocked" },
  ]);
  assert.deepEqual(out.map(({ address, x }) => [address, x]), [
    ["a", LEFT],
    ["b", LEFT + SLOT],
    ["c", LEFT + SLOT * 2],
  ]);
});

test("the same address keeps the same kind when its status changes", () => {
  const [first] = agents([{ address: "stable", status: "idle" }]);
  const [second] = agents([{ address: "stable", status: "blocked" }]);
  assert.equal(first.kind, second.kind);
});

test("working children walk beside a parent in phase zero without meeting", () => {
  const out = agents(
    [
      { address: "parent", status: "working" },
      { address: "child", status: "working", parent: "parent" },
    ],
    { parent: { x: LEFT } },
    400,
    0,
    true,
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(parent.x, LEFT);
  assert.equal(child.x, parent.x + SLOT);
  assert.equal(child.meet, false);
});

test("working children meet beside parents in phase one and both speak", () => {
  const out = agents(
    [
      { address: "parent", status: "working" },
      { address: "child", status: "working", parent: "parent" },
    ],
    { parent: { x: 400 - SLOT } },
    400,
    1,
    true,
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(parent.x, 400 - SLOT);
  assert.equal(child.x, parent.x - SLOT);
  assert.equal(child.meet, true);
  assert.notEqual(child.say, null);
  assert.notEqual(parent.say, null);
});

test("working children wander during phase two when roaming", () => {
  const out = place(
    [
      { address: "parent", status: "idle" },
      { address: "child", status: "working", parent: "parent" },
    ],
    { parent: { x: LEFT }, child: { x: LEFT + SLOT } },
    400,
    2,
    true,
    () => 1,
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(child.meet, false);
  assert.equal(child.x, LEFT + SLOT + 160);
  assert.notEqual(child.x, parent.x + SLOT);
});

test("a blocked child stands beside its parent and asks for help", () => {
  const out = agents(
    [
      { address: "parent", status: "working" },
      { address: "child", label: "child", status: "blocked", parent: "parent" },
    ],
    { parent: { x: LEFT } },
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(child.x, parent.x + SLOT);
  assert.ok(ANSWER.blocked.includes(child.say));
  assert.ok(REPLY.blocked.map((l) => l.replace("{name}", "child")).includes(parent.say));
});

test("a done child says done and its parent replies nice", () => {
  const out = agents(
    [
      { address: "parent", status: "working" },
      { address: "child", label: "child", status: "done", parent: "parent" },
    ],
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.ok(ANSWER.done.includes(child.say));
  assert.ok(REPLY.done.map((l) => l.replace("{name}", "child")).includes(parent.say));
});

test("a roaming working parent holds its x while its working child approaches or chats", () => {
  for (const tick of [0, 1]) {
    const [parent] = agents(
      [
        { address: "parent", status: "working" },
        { address: "child", status: "working", parent: "parent" },
      ],
      { parent: { x: 201 } },
      600,
      tick,
      true,
    );
    assert.equal(parent.x, 201);
  }
});

test("pet count is capped by the available slots, keeping blocked pets first", () => {
  const width = LEFT + SLOT * 2 + 20;
  const out = agents(
    [
      ...Array.from({ length: 5 }, (_, i) => ({ address: `idle-${i}`, status: "idle" })),
      { address: "blocked", status: "blocked" },
    ],
    {},
    width,
  );

  assert.equal(out.length, Math.floor((width - LEFT) / SLOT));
  assert.equal(out[0].address, "blocked");
});

test("claude and codex agents get their own creature, others one of KINDS", () => {
  assert.equal(kindFor("claude-code", 0), "claude-code");
  assert.equal(kindFor("codex", 0), "codex-openai");
  assert.equal(kindFor("pi", 5), KINDS[5 % KINDS.length]);
  assert.equal(kindFor(null, 2), KINDS[2]);
  const [pet] = collect([terminal("t1", "working", { agent: "codex" })], []).map((p) => agents([p])[0]);
  assert.equal(pet.kind, "codex-openai");
  const apps = collect([
    terminal("t2", "idle", { report: { app: "claude-code" }, program: { key: "agent" } }),
    terminal("t3", "idle", { program: { key: "claude" }, agent: "node" }),
  ], []).map((p) => p.app);
  assert.deepEqual(apps, ["claude-code", "claude"]);
});

test("a fast release throws the pet on, a slow one drops it in place", () => {
  assert.equal(landing([]), null);
  assert.equal(landing([{ x: 100, t: 0 }]), null);
  assert.equal(landing([{ x: 100, t: 0 }, { x: 110, t: 100 }]), null); // 0.1 px/ms: a drop
  assert.equal(landing([{ x: 100, t: 0 }, { x: 200, t: 100 }]), 600); // 1 px/ms right: 400 px on
  assert.equal(landing([{ x: 500, t: 0 }, { x: 450, t: 50 }]), 50); // 1 px/ms left
});

test("idle pets shuffle a short way, other unblocked pets walk at most 160 px a beat", () => {
  const list = [{ address: "sleepy", status: "idle" }, { address: "happy", status: "done" }];
  const prev = { sleepy: { x: 300 }, happy: { x: 300 } };
  const out = Object.fromEntries(place(list, prev, 1000, 2, true, () => 1).map((p) => [p.address, p.x]));
  assert.equal(out.sleepy, 360);
  assert.equal(out.happy, 460);
});

test("a held pet stays where it was dropped, even blocked or as a child", () => {
  const list = [
    { address: "parent", status: "working" },
    { address: "kid", status: "blocked", parent: "parent" },
    { address: "lone", status: "blocked" },
  ];
  const prev = { parent: { x: 100 }, kid: { x: 400 }, lone: { x: 300 } };
  const out = place(list, prev, 600, 3, true, () => 0.9, new Set(["kid", "lone"]));
  const at = Object.fromEntries(out.map((p) => [p.address, p.x]));
  assert.equal(at.kid, 400);
  assert.equal(at.lone, 300);
  assert.equal(out.find((p) => p.address === "kid").say, null);
});

test("collect carries the task title and when the tab began working", () => {
  const [pet, quiet] = collect(
    [terminal("a", "working"), terminal("b", "idle")],
    [{ address: "a", title: "fix the build", tab: "tab1" }, { address: "b", title: "zsh", tab: "tab2" }],
    [{ tabs: [{ id: "tab1", working_since: 1000 }, { id: "tab2", working_since: 5 }] }],
  );
  assert.equal(pet.title, "fix the build");
  assert.equal(pet.since, 1000);
  assert.equal(quiet.since, null); // only working pets carry a start time
});

test("runtime and describe format a pet's tooltip", () => {
  assert.equal(runtime(45_000), "45s");
  assert.equal(runtime(192_000), "3m 12s");
  assert.equal(runtime(3_900_000), "1h 5m");
  assert.equal(describe({ label: "api", status: "working", since: 1000, title: "fix tests" }, 66_000), "api · working 1m 5s · fix tests");
  assert.equal(describe({ label: "api", status: "idle", title: "api" }, 0), "api · idle");
});

test("transitions reports only pets that turned blocked or done, not first sightings", () => {
  const last = {};
  assert.deepEqual(transitions(last, [{ address: "a", status: "blocked" }]), []);
  assert.deepEqual(transitions(last, [{ address: "a", status: "working" }]), []);
  assert.deepEqual(transitions(last, [{ address: "a", status: "done" }]).map((p) => p.address), ["a"]);
  assert.deepEqual(transitions(last, [{ address: "a", status: "done" }]), []);
});

test("favorites follow blocked pets, and the offset scrolls past what fits", () => {
  const width = LEFT + SLOT * 2;
  const list = ["a", "b", "c", "d"].map((address) => ({ address, status: "idle" }));
  list.push({ address: "z", status: "blocked" });
  const first = (opts) => place(list, {}, width, 0, false, () => 0.5, new Set(), opts).map((p) => p.address);
  assert.deepEqual(first({ favs: { d: true } }), ["z", "d"]);
  assert.deepEqual(first({ offset: 2 }), ["b", "c"]);
  assert.deepEqual(first({ offset: 99 }), ["c", "d"]); // clamped to the last full page
  assert.equal(capacity(width), 2);
});

test("a picked sprite overrides the automatic one", () => {
  const [pet] = place([{ address: "a", status: "idle", app: "claude-code" }], {}, 400, 0, false, () => 0.5, new Set(), { kinds: { a: "frog" } });
  assert.equal(pet.kind, "frog");
  assert.ok(EXTRA.every((k) => SPRITES.includes(k) && !KINDS.includes(k)));
});

test("a speaker does not repeat its recent lines, and a tick's line holds across redraws", () => {
  const said = {};
  const list = [{ address: "p", status: "working" }, { address: "c", status: "working", parent: "p", label: "kid" }];
  const line = (tick) => place(list, { p: { x: 400 - SLOT } }, 400, tick, false, () => 0.5, new Set(), { said })
    .find((p) => p.address === "c").say;
  const seen = [];
  for (let tick = 1; tick <= 12; tick += 3) seen.push(line(tick)); // phase 1: the helper chats every third tick
  assert.equal(line(10), seen[3]);
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(seen.every((s) => ANSWER.working.includes(s)));
});
