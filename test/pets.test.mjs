import { test } from "node:test";
import assert from "node:assert/strict";
import { hash, collect, place, kindFor, landing, KINDS, SLOT, LEFT } from "../mods/herdr-pets/pets.js";

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
    { address: "space", status: "working", app: null, label: "The Space", parent: null },
    { address: "plain", status: "blocked", app: null, label: "hc-plain", parent: null },
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
      { address: "child", status: "blocked", parent: "parent" },
    ],
    { parent: { x: LEFT } },
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(child.x, parent.x + SLOT);
  assert.equal(child.say, "stuck, help?");
  assert.equal(parent.say, "on my way");
});

test("a done child says done and its parent replies nice", () => {
  const out = agents(
    [
      { address: "parent", status: "working" },
      { address: "child", status: "done", parent: "parent" },
    ],
  );
  const parent = out.find(({ address }) => address === "parent");
  const child = out.find(({ address }) => address === "child");
  assert.equal(child.say, "done ✓");
  assert.equal(parent.say, "nice!");
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
