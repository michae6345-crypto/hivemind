#!/usr/bin/env node
// SYNTHETIC session history for the learning dashboard (run after scripts/seed.mjs).
// Writes 30 past Claude Code sessions over the last ~14 days into pack_log + events:
//   session_start → corrections (each tagged with the lesson topic it is about, or none) → session_end {topics, corrections}
//   approval / rejection events at the moments lessons were reviewed.
// Corrections on a topic are likely (p≈0.75) until its lesson is approved, then rare (p≈0.07: repeat mistakes),
// plus untopical one-off corrections that never become lessons — so the curve falls with noise, not a straight line.
// Lesson origins line up with the evidence actors/dates already on the seeded memories (e.g. use-logger ← alex, 10-08),
// so cross-user transfer (/api/metrics) is computed from the data, not hard-coded.
//
// Every row is marked: events.payload.synthetic = true, pack_log.session_id = 'hist-NN'. Re-running replaces only those rows.
//   node scripts/seed-history.mjs            (deterministic: seeded PRNG)
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

function must(label, r) {
  if (r.error) {
    console.error(`✗ ${label}:`, r.error.message);
    process.exit(1);
  }
  return r.data;
}

// mulberry32 — deterministic noise
let seed = 20261017;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const at = (iso) => new Date(iso).getTime();

// Lessons learned during the window: origin correction (actor, time, repo) → approval (approver, delay).
// Origins match the first evidence entry on the seeded memory.
const TIMELINE = [
  { slug: "migrations-append-only", origin: "jordan", repo: "repo/export-service", t: at("2026-10-02T18:10:00Z"), approver: "maya", delayH: 20 },
  { slug: "money-integer-cents", origin: "jordan", repo: "repo/export-service", t: at("2026-10-05T17:30:00Z"), approver: "maya", delayH: 22 },
  { slug: "use-pnpm", origin: "noor", repo: "repo/dataset-builder", t: at("2026-10-07T16:40:00Z"), approver: "jordan", delayH: 5 },
  { slug: "use-logger", origin: "alex", repo: "repo/export-service", t: at("2026-10-08T19:20:00Z"), approver: "maya", delayH: 18 },
  { slug: "stream-uploads", origin: "noor", repo: "repo/export-service", t: at("2026-10-10T17:05:00Z"), approver: "jordan", delayH: 26 },
  { slug: "snapshot-after-model-change", origin: "alex", repo: "repo/dataset-builder", t: at("2026-10-12T20:15:00Z"), approver: "jordan", delayH: 4 },
  { slug: "grader-negative-test", origin: "riley", repo: "repo/eval-harness", t: at("2026-10-14T18:45:00Z"), approver: "priya", delayH: 3 },
];
// Proposed lessons that reviewers rejected (one-off preferences / task-specific fixes). No memory row exists for these.
const REJECTED = [
  { slug: "prefer-two-space-indent", title: "Use 2-space indent in SQL", actor: "jordan", t: at("2026-10-04T22:00:00Z") },
  { slug: "rename-batch-helper", title: "Rename loadBatch to fetchBatch", actor: "jordan", t: at("2026-10-09T21:00:00Z") },
  { slug: "skip-tests-for-scripts", title: "Scripts don't need tests", actor: "priya", t: at("2026-10-13T23:00:00Z") },
];

// Which learnable topics a session in each repo can touch.
const REPO_TOPICS = {
  "repo/export-service": ["migrations-append-only", "money-integer-cents", "use-logger", "stream-uploads"],
  "repo/dataset-builder": ["use-pnpm", "snapshot-after-model-change", "migrations-append-only", "use-logger"],
  "repo/eval-harness": ["grader-negative-test", "use-logger"],
  "repo/expert-portal": ["money-integer-cents", "use-logger"],
};
const PEOPLE_REPOS = {
  alex: ["repo/export-service", "repo/dataset-builder"],
  noor: ["repo/export-service", "repo/dataset-builder"],
  jordan: ["repo/export-service"],
  riley: ["repo/eval-harness"],
  priya: ["repo/eval-harness"],
  sam: ["repo/expert-portal"],
};
const WEIGHTED_PEOPLE = ["alex", "alex", "noor", "noor", "riley", "riley", "jordan", "priya", "sam", "sam"];

const TEXTS = {
  "migrations-append-only": ["don't edit 001_init.sql, it already ran in prod — add a new migration", "never change an existing migration file, write 004_… instead"],
  "money-integer-cents": ["amounts are integer cents, not 12.5 dollars", "no floats for payouts — use cents"],
  "use-pnpm": ["use pnpm here, you just created a package-lock.json", "it's pnpm install, not npm install"],
  "use-logger": ["don't console.log, use logger from src/logger.ts", "swap those console.error calls for logger.error"],
  "stream-uploads": ["don't build the whole export in memory, stream it to the sink", "that buffers 2GB — stream the upload in chunks"],
  "snapshot-after-model-change": ["you changed the model, regenerate the schema snapshots", "run pnpm snapshots after touching models/"],
  "grader-negative-test": ["add a subtly-wrong solution test for this grader", "the grader needs a near-miss negative test"],
};
const NOISE = [
  "no, I meant the other endpoint",
  "revert that rename, keep the old function name",
  "too much — just fix the failing test",
  "use the existing helper instead of writing a new one",
  "wrong file, it's the v2 handler",
  "keep the diff smaller please",
  "don't change the public signature",
];

// ---- build 30 sessions ----
const end = at("2026-10-16T22:00:00Z");
const start = at("2026-10-02T16:00:00Z");
const sessions = TIMELINE.map((l) => ({ actor: l.origin, repo: l.repo, t: l.t - 25 * 60e3, force: l.slug }));
while (sessions.length < 30) {
  const day = Math.floor(rand() * 15);
  const t = start + day * DAY + (rand() * 8 + 0.5) * HOUR; // ~9am–5pm PT
  if (t > end) continue;
  const actor = pick(WEIGHTED_PEOPLE);
  sessions.push({ actor, repo: pick(PEOPLE_REPOS[actor]), t });
}
sessions.sort((a, b) => a.t - b.t);

const memories = must("memories", await sb.from("memories").select("id,slug,scope_id,status,locked,evidence"));
const scopes = must("scopes", await sb.from("scopes").select("id,parent_id"));
const bySlug = new Map(memories.map((m) => [m.slug, m]));
for (const l of TIMELINE) if (!bySlug.has(l.slug)) throw new Error(`memory ${l.slug} missing — run scripts/seed.mjs first`);
const parent = new Map(scopes.map((s) => [s.id, s.parent_id]));
const chain = (id) => {
  const out = [];
  for (let c = id; c && !out.includes(c); c = parent.get(c)) out.push(c);
  return out;
};
const approvedAt = new Map(TIMELINE.map((l) => [l.slug, l.t + l.delayH * HOUR]));
const learnedSlugs = new Set(TIMELINE.map((l) => l.slug));
// Memories already active before the window (locked rules, older lessons) are in every pack whose scope matches.
const preexisting = memories.filter((m) => m.status === "active" && !learnedSlugs.has(m.slug) && (m.evidence ?? []).every((e) => !e.at || at(e.at) < start));

const events = [];
const packRows = [];
const iso = (t) => new Date(t).toISOString();
sessions.forEach((s, i) => {
  const sid = `hist-${String(i + 1).padStart(2, "0")}`;
  const sc = chain(s.repo);
  const inPack = [
    ...preexisting.filter((m) => sc.includes(m.scope_id)),
    ...TIMELINE.filter((l) => approvedAt.get(l.slug) < s.t).map((l) => bySlug.get(l.slug)).filter((m) => sc.includes(m.scope_id)),
  ];
  const memoryIds = inPack.map((m) => m.id);
  const tokens = 140 + inPack.length * 70;
  // topics this session touches: 2–3 of the repo's learnable topics (+ the forced origin topic)
  const pool = REPO_TOPICS[s.repo].filter((x) => x !== s.force).sort(() => rand() - 0.5);
  const topics = [...new Set([...(s.force ? [s.force] : []), ...pool.slice(0, 2 + Math.floor(rand() * 2))])];
  const corrections = [];
  for (const topic of topics) {
    const active = approvedAt.get(topic) < s.t;
    const p = topic === s.force ? 1 : active ? 0.07 : 0.75;
    if (rand() < p) corrections.push({ lesson: topic, text: pick(TEXTS[topic]), repeat: active });
  }
  const noiseN = rand() < 0.55 ? 1 : rand() < 0.25 ? 2 : 0;
  for (let k = 0; k < noiseN; k++) corrections.push({ lesson: null, text: pick(NOISE), repeat: false });

  events.push({ type: "session_start", actor: s.actor, session_id: sid, repo: s.repo, created_at: iso(s.t),
    payload: { synthetic: true, memoryIds, tokens, lessons: inPack.filter((m) => !m.locked).length, locked: inPack.filter((m) => m.locked).length } });
  corrections.forEach((c, k) =>
    events.push({ type: "correction", actor: s.actor, session_id: sid, repo: s.repo, processed: true, created_at: iso(s.t + (8 + k * 9) * 60e3),
      payload: { synthetic: true, text: c.text, lesson: c.lesson, repeatOfActiveLesson: c.repeat } }));
  events.push({ type: "session_end", actor: s.actor, session_id: sid, repo: s.repo, created_at: iso(s.t + 55 * 60e3),
    payload: { synthetic: true, corrections: corrections.length, topics } });
  packRows.push({ session_id: sid, actor: s.actor, repo: s.repo, memory_ids: memoryIds, tokens, corrections: corrections.length, created_at: iso(s.t) });
});
for (const l of TIMELINE) {
  const m = bySlug.get(l.slug);
  events.push({ type: "approval", actor: l.approver, repo: l.repo, created_at: iso(approvedAt.get(l.slug)),
    payload: { synthetic: true, memoryId: m.id, slug: l.slug } });
}
for (const r of REJECTED) events.push({ type: "rejection", actor: r.actor, created_at: iso(r.t), payload: { synthetic: true, slug: r.slug, title: r.title } });

// ---- replace previous synthetic rows only ----
must("delete events", await sb.from("events").delete().eq("payload->>synthetic", "true"));
must("delete pack_log", await sb.from("pack_log").delete().like("session_id", "hist-%"));
must("insert pack_log", await sb.from("pack_log").insert(packRows));
must("insert events", await sb.from("events").insert(events.map((e) => ({ processed: true, repo: null, session_id: null, ...e }))));

console.log(`✓ synthetic history: ${packRows.length} sessions, ${events.length} events (${events.filter((e) => e.type === "correction").length} corrections, ${TIMELINE.length} approvals, ${REJECTED.length} rejections)`);
console.log("  corrections per session:", packRows.map((r) => r.corrections).join(" "));
