#!/usr/bin/env node
// Reset the shared Supabase DB to a clean demo state before recording.
//
//   node scripts/reset-demo.mjs --dry-run          # print what would be deleted, change nothing
//   node scripts/reset-demo.mjs                    # delete leftovers, re-run scripts/seed.mjs
//   node scripts/reset-demo.mjs --drop export-assert-single-customer
//                                                  # …and remove these seed memories so a live correction creates them fresh
//
// Deletes: memories whose slug is not in the seed (smoke tests, live/e2e proposals) plus any 'api-test-%' /
//          'Smoke test lesson…' memory, every non-synthetic event (and any event with payload.slug 'api-test-%'),
// all activity rows, and every pack_log row that is not synthetic history (session_id 'hist-*').
// Keeps:   synthetic history from scripts/seed-history.mjs (events.payload.synthetic = true, pack_log 'hist-*');
//          re-runs seed-history if it is missing. Then re-runs scripts/seed.mjs so seed memories match the seed exactly.
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
const mems = must("memories", await sb.from("memories").select("id,slug,title,status,source,author"));
// Known test leftovers are always removed (A's API tests, smoke runs), even if a seed slug ever collides.
const TEST_SLUG = /^(api-test-|smoke-test-)/i;
const TEST_TITLE = /^(smoke test lesson|api test:)/i;
const isTestMem = (m) => TEST_SLUG.test(m.slug ?? "") || TEST_TITLE.test(m.title ?? "");
const extraMems = mems.filter((m) => !seedSlugs.has(m.slug) || isTestMem(m));
const events = must("events", await sb.from("events").select("id,type,actor,session_id,payload").limit(10000));
const liveEvents = events.filter((e) => e.payload?.synthetic !== true || TEST_SLUG.test(String(e.payload?.slug ?? "")));
const activity = must("activity", await sb.from("activity").select("id,session_id,actor,file").limit(10000));
const packs = must("pack_log", await sb.from("pack_log").select("id,session_id,actor").limit(10000));
const livePacks = packs.filter((p) => !String(p.session_id).startsWith("hist-"));
const histCount = packs.length - livePacks.length;

const summarize = (rows, f) => {
  const g = {};
  for (const r of rows) g[f(r)] = (g[f(r)] ?? 0) + 1;
  return Object.entries(g).map(([k, n]) => `${k} ×${n}`).join(", ") || "—";
};
const sess = (s) => String(s ?? "∅").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/i, "<uuid>").replace(/\d{6,}/g, "<n>");
console.log(`${DRY ? "[dry-run] would delete" : "deleting"}:`);
console.log(`  memories not in seed (${extraMems.length}):`);
for (const m of extraMems) console.log(`    - ${m.status.padEnd(8)} ${m.source.padEnd(10)} ${m.slug}  "${m.title}"${isTestMem(m) ? "  [test leftover]" : ""}`);
console.log(`  non-synthetic events (${liveEvents.length}): ${summarize(liveEvents, (e) => `${e.type}[${sess(e.session_id)}]`)}`);
console.log(`  activity (${activity.length}): ${summarize(activity, (a) => `${a.actor}:${sess(a.session_id)}`)}`);
console.log(`  non-synthetic pack_log (${livePacks.length}): ${summarize(livePacks, (p) => `${p.actor}:${sess(p.session_id)}`)}`);
if (DROP.length) console.log(`  seed memories to drop after seeding: ${DROP.join(", ")}`);
console.log(`keeping: ${histCount} synthetic sessions, ${events.length - liveEvents.length} synthetic events${histCount ? "" : " (none → will re-run seed-history)"}`);
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
