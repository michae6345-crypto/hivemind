#!/usr/bin/env node
// QA2: the two in-pane latencies, measured with the real watch modules against prod (headless, no terminal).
//   (a) write → flag: startWatcher() on a temp copy of playground/, an "agent" writes a file that logs an email,
//       time until state.flags[file] holds the locked rule (local detectors) and until the server confirms.
//   (b) approve → celebration: kevin teaches a test lesson, ben approves it, kevin's pane polls /api/activity/live
//       every POLL_MS (as app.mjs does) and turns it into cards (data.toCards); time until the "approved" card for
//       kevin's lesson appears (that is what fires actions.celebrate). The lesson is rejected afterwards.
//
//   node scripts/qa-flow-timing.mjs [--base …] [--runs 3] [--skip-approve] [--poll 2000]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://hivemind-q17i.onrender.com").replace(/\/+$/, "");
const RUNS = Number(arg("runs", 3));
const POLL = Number(arg("poll", 2000));
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { startWatcher } = await imp("cli/watch/watcher.mjs");
const { makeApi, toCards, short, ownerOf } = await imp("cli/watch/data.mjs");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "hm-qa2-flow-"));
fs.cpSync(path.join(root, "playground"), work, { recursive: true, filter: (p) => !p.includes("node_modules") });
const cfg = { url: BASE, token: process.env.HIVEMIND_TOKEN, actor: "kevin", repo: "repo/playground", root: work, flags: {} };
const state = { actor: "kevin", role: "engineer", flags: {}, files: {}, view: {}, live: { items: [], feed: [] }, rules: [], scopes: [], memories: [] };
const api = makeApi(cfg, () => state);
state.rules = (await api.rules("")).rules ?? [];

// ---------- (a) write → flag ----------
const marks = [];
let onFlag = null;
const actions = {
  render() {
    onFlag?.();
  },
  setTab() {
    onFlag?.();
  },
  animate() {},
  toast() {},
  pushCard() {},
  plainError: (e) => String(e?.message ?? e),
};
const clean = `import { logger } from "./logger";
export function sent(expert: { id: string }) {
  logger.info("payout sent", { expertId: expert.id });
}
`;
const stop = startWatcher({ root: work, cfg, state, api, actions });
await new Promise((r) => setTimeout(r, 800)); // let the fix tracker seed
for (let i = 0; i < RUNS; i++) {
  const rel = `src/qa2-payout-${i}.ts`;
  const text = `import { logger } from "./logger";\nexport function sent(expert: { id: string; email: string }) {\n  logger.info("payout sent", { email: expert.email });\n}\n`;
  const t0 = performance.now();
  let local = null;
  let server = null;
  const done = new Promise((resolve) => {
    onFlag = () => {
      const f = state.files[rel];
      const hit = (state.flags[rel] ?? []).some((v) => v.locked);
      if (hit && local === null) local = performance.now() - t0;
      if (hit && f && !f.checking && server === null) {
        server = performance.now() - t0;
        resolve();
      }
    };
    setTimeout(resolve, 15000);
  });
  fs.writeFileSync(path.join(work, rel), text);
  await done;
  marks.push({ local, server });
  console.log(`write→flag run ${i + 1}: local detectors ${local?.toFixed(0) ?? "—"} ms · server-confirmed ${server?.toFixed(0) ?? "—"} ms`);
  await new Promise((r) => setTimeout(r, 300));
}
// A clean file: Here shows "This file follows every team rule." only once the check is back (here.mjs: checking && !checkedAt).
for (let i = 0; i < RUNS; i++) {
  const rel = `src/qa2-clean-${i}.ts`;
  const t0 = performance.now();
  let shown = null;
  const done = new Promise((resolve) => {
    onFlag = () => {
      const f = state.files[rel];
      if (f && f.checkedAt && !f.checking && !(state.flags[rel] ?? []).length && shown === null) {
        shown = performance.now() - t0;
        resolve();
      }
    };
    setTimeout(resolve, 15000);
  });
  fs.writeFileSync(path.join(work, rel), clean);
  await done;
  console.log(`write→"follows every team rule" run ${i + 1}: ${shown?.toFixed(0) ?? "—"} ms`);
  await new Promise((r) => setTimeout(r, 300));
}
onFlag = null;
stop();

// ---------- (b) approve → celebration ----------
if (!process.argv.includes("--skip-approve")) {
  const H = (user, role) => ({
    authorization: `Bearer ${process.env.HIVEMIND_TOKEN}`,
    "x-hm-user": user,
    "x-hm-repo": "repo/playground",
    ...(role ? { "x-hm-role": role } : {}),
    "content-type": "application/json",
  });
  const post = async (p, body, h) => {
    const res = await fetch(BASE + p, { method: "POST", headers: h, body: JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const sc = await api.scopes();
  state.scopes = sc.scopes;
  const stamp = Date.now().toString(36);
  const t = await post(
    "/api/events",
    { type: "agent_proposal", actor: "kevin", repo: "repo/playground", payload: { title: `QA2 timing probe ${stamp}`, body: `QA2 timing probe ${stamp}: ignore, rejected by QA.`, scope: "repo/playground" } },
    H("kevin"),
  );
  const mem = t.body?.lessons?.[0] ?? t.body?.captured?.[0]?.memory;
  if (!mem) {
    console.log("could not create probe lesson:", t.status, JSON.stringify(t.body).slice(0, 200));
  } else {
    console.log(`probe lesson ${mem.id} (${mem.status}, author ${mem.author})`);
    const seen = new Set();
    const prime = await api.live();
    const memories = await api.memories();
    for (const c of toCards(prime, new Map(memories.map((m) => [m.id, m])), { shortRepo: short, now: Date.now(), approverOf: (s) => ownerOf(s, state.scopes) })) seen.add(c.key);
    // kevin's pane polls on its own 2s clock; ben approves at a random phase of it
    let celebrated = null;
    const t0 = { v: 0 };
    const tick = async () => {
      const [live, mems] = await Promise.all([api.live(), api.memories()]);
      const cards = toCards(live, new Map(mems.map((m) => [m.id, m])), { shortRepo: short, now: Date.now(), approverOf: (s) => ownerOf(s, state.scopes) });
      for (const c of cards) {
        if (seen.has(c.key)) continue;
        seen.add(c.key);
        if (t0.v && c.kind === "approved" && c.memory?.id === mem.id && c.memory?.author === "kevin" && celebrated === null) celebrated = performance.now() - t0.v;
      }
    };
    const iv = setInterval(() => void tick().catch(() => {}), POLL);
    await new Promise((r) => setTimeout(r, Math.random() * POLL + 500));
    t0.v = performance.now();
    const ap = await post(`/api/memories/${mem.id}/approve`, {}, H("ben", "lead"));
    const approveMs = performance.now() - t0.v;
    console.log(`ben approve → ${ap.status} ${ap.body?.status ?? ap.body?.error ?? ""} in ${approveMs.toFixed(0)} ms`);
    for (let i = 0; i < 40 && celebrated === null; i++) await new Promise((r) => setTimeout(r, 100));
    clearInterval(iv);
    console.log(`approve → celebration on kevin's pane: ${celebrated?.toFixed(0) ?? "not seen in 4s+"} ms (poll ${POLL} ms)`);
    const rj = await post(`/api/memories/${mem.id}/reject`, {}, H("ben", "lead"));
    console.log(`cleanup reject → ${rj.status} ${rj.body?.status ?? rj.body?.error ?? ""}`);
  }
}
fs.rmSync(work, { recursive: true, force: true });
process.exitCode = 0;
