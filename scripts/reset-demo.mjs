#!/usr/bin/env node
// Reset the shared Supabase DB to a clean demo state before recording.
//
//   node scripts/reset-demo.mjs --dry-run          # print what would be deleted, change nothing
//   node scripts/reset-demo.mjs                    # delete leftovers, re-run scripts/seed.mjs
//   node scripts/reset-demo.mjs --all-extra        # …and also delete hand-written non-seed memories (scenario lessons)
//   node scripts/reset-demo.mjs --drop export-assert-single-customer
//                                                  # …and remove these seed memories so a live correction creates them fresh
//
// Deletes (incl. pack_log rows with an empty or 'preview…' session from UI/curl checks): memories whose slug is not in the seed (smoke tests, live/e2e proposals) plus any 'api-test-%' /
//          'Smoke test lesson…' memory, every non-synthetic event (and any event with payload.slug 'api-test-%'),
// all activity rows, and every pack_log row that is not synthetic history (session_id 'hist-*').
// Keeps:   everything in repo/playground (memories by scope, events/activity/pack_log by repo; Michael's experiments);
//          synthetic history from scripts/seed-history.mjs (events.payload.synthetic = true, pack_log 'hist-*');
//          re-runs seed-history if it is missing. Then re-runs scripts/seed.mjs so seed memories match the seed exactly,
//          then scripts/seed-scenarios.mjs (agent A) if present.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

const DRY = process.argv.includes("--dry-run");
const ALL_EXTRA = process.argv.includes("--all-extra"); // also delete hand-written non-seed memories (e.g. scenario lessons)
const dropIdx = process.argv.indexOf("--drop");
const DROP = dropIdx >= 0 ? (process.argv[dropIdx + 1] ?? "").split(",").filter(Boolean) : [];

function must(label, r) {
  if (r.error) {
    console.error(`✗ ${label}:`, r.error.message);
    process.exit(1);
  }
  return r.data;
}

const { memories: seedMemories } = await import(pathToFileURL(path.join(root, "src/mocks/data.ts")).href);
const seedSlugs = new Set(seedMemories.map((m) => m.slug));

// ---- what would go ----
const mems = must("memories", await sb.from("memories").select("id,slug,scope_id,title,status,source,author"));
// Known test leftovers are always removed (A's API tests, smoke runs), even if a seed slug ever collides.
const TEST_SLUG = /^(api-test-|smoke-test-)/i;
const TEST_TITLE = /^(smoke test lesson|api test:)/i;
// UI preview / curl checks: empty session or 'preview…' sessions (pack.ts no longer logs these, older rows may remain)
const isPreview = (sid) => !sid || !String(sid).trim() || /^preview/i.test(String(sid));
const isTestMem = (m) => TEST_SLUG.test(m.slug ?? "") || TEST_TITLE.test(m.title ?? "");
// Lessons the engine creates live (corrections, e2e, smoke) get a random 4-char suffix with a digit: "…-tests-df9a".
// Hand-written non-seed slugs (A's scenario lessons: "kappa-gate", "embedding-batch-96") are kept unless --all-extra.
const engineMade = (slug) => {
  const m = String(slug ?? "").match(/-([0-9a-z]{4})$/);
  return !!m && /\d/.test(m[1]);
};
const nonSeed = mems.filter((m) => !seedSlugs.has(m.slug));
// Michael's experiments live in repo/playground: reset never touches its memories, events, activity or sessions.
const isPlayground = (repo) => repo === "repo/playground" || repo === "playground";
const extraMems = mems.filter(
  (m) => m.scope_id !== "repo/playground" && (isTestMem(m) || (!seedSlugs.has(m.slug) && (ALL_EXTRA || engineMade(m.slug)))),
);
const keptExtra = nonSeed.filter((m) => !extraMems.includes(m));
const events = must("events", await sb.from("events").select("id,type,actor,session_id,repo,payload").limit(10000));
const liveEvents = events.filter(
  (e) =>
    !isPlayground(e.repo) &&
    (e.payload?.synthetic !== true || TEST_SLUG.test(String(e.payload?.slug ?? "")) || (e.type === "session_start" && isPreview(e.session_id))),
);
const activity = must("activity", await sb.from("activity").select("id,session_id,actor,repo,file").limit(10000)).filter((a) => !isPlayground(a.repo));
const allPacks = must("pack_log", await sb.from("pack_log").select("id,session_id,actor,repo").limit(10000));
const packs = allPacks.filter((p) => !isPlayground(p.repo));
const livePacks = packs.filter((p) => isPreview(p.session_id) || !String(p.session_id).startsWith("hist-"));
const histCount = packs.length - livePacks.length;
const playgroundKept = mems.filter((m) => m.scope_id === "repo/playground").length + (allPacks.length - packs.length);

const summarize = (rows, f) => {
  const g = {};
  for (const r of rows) g[f(r)] = (g[f(r)] ?? 0) + 1;
  return Object.entries(g).map(([k, n]) => `${k} ×${n}`).join(", ") || "—";
};
const sess = (s) => String(s ?? "∅").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/i, "<uuid>").replace(/\d{6,}/g, "<n>");
console.log(`${DRY ? "[dry-run] would delete" : "deleting"}:`);
console.log(`  non-seed memories from live takes / tests (${extraMems.length}):`);
for (const m of extraMems) console.log(`    - ${m.status.padEnd(8)} ${m.source.padEnd(10)} ${m.slug}  "${m.title}"${isTestMem(m) ? "  [test leftover]" : ""}`);
console.log(`  non-synthetic events (${liveEvents.length}): ${summarize(liveEvents, (e) => `${e.type}[${sess(e.session_id)}]`)}`);
console.log(`  activity (${activity.length}): ${summarize(activity, (a) => `${a.actor}:${sess(a.session_id)}`)}`);
console.log(`  non-synthetic pack_log (${livePacks.length}, ${livePacks.filter((p) => isPreview(p.session_id)).length} preview/empty-session): ${summarize(livePacks, (p) => `${p.actor}:${sess(p.session_id)}`)}`);
if (DROP.length) console.log(`  seed memories to drop after seeding: ${DROP.join(", ")}`);
console.log(`keeping: repo/playground (${playgroundKept} memories/sessions), ${keptExtra.length} hand-written non-seed memories${keptExtra.length ? ` (${keptExtra.slice(0, 4).map((m) => m.slug).join(", ")}${keptExtra.length > 4 ? ", …" : ""}; --all-extra deletes them)` : ""}, ${histCount} synthetic sessions, ${events.length - liveEvents.length} synthetic events${histCount ? "" : " (none → will re-run seed-history)"}`);
if (DRY) process.exit(0);

// ---- delete ----
const ids = (rows) => rows.map((r) => r.id);
async function delIn(table, list) {
  for (let i = 0; i < list.length; i += 200) must(`delete ${table}`, await sb.from(table).delete().in("id", list.slice(i, i + 200)));
}
const extraIds = ids(extraMems);
if (extraIds.length) {
  // invalidated_by is a self-FK: clear references to rows we are about to delete
  must("clear invalidated_by", await sb.from("memories").update({ invalidated_by: null }).in("invalidated_by", extraIds));
  await delIn("memories", extraIds);
}
await delIn("events", ids(liveEvents));
await delIn("activity", ids(activity));
await delIn("pack_log", ids(livePacks));

// ---- re-seed ----
const run = (script) => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", script)], { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`✗ ${script} failed`);
    process.exit(1);
  }
};
run("seed.mjs");
// Realistic B2B SaaS scenario lessons (agent A). Runs only once the script exists on main.
if (existsSync(path.join(root, "scripts", "seed-scenarios.mjs"))) run("seed-scenarios.mjs");
if (!histCount) run("seed-history.mjs");

if (DROP.length) {
  const drop = must("drop lookup", await sb.from("memories").select("id,slug").in("slug", DROP));
  if (drop.length) {
    must("clear invalidated_by", await sb.from("memories").update({ invalidated_by: null }).in("invalidated_by", ids(drop)));
    await delIn("memories", ids(drop));
  }
  console.log(`✓ dropped ${drop.map((d) => d.slug).join(", ") || "(none found)"}`);
}
console.log("✓ demo DB reset");
