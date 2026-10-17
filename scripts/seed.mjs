#!/usr/bin/env node
// Seed the fictional demo company (Meridian Data, "a company like AfterQuery") into Supabase.
// Source of truth is the UI's src/mocks/data.ts (Node 24 strips TS types), so mock data and DB match.
// Idempotent: upserts scopes/people by id and memories by deterministic uuid (from slug).
// Re-running also resets seeded memories to their demo state (status, alpha/beta, fresh timestamps).
// Never deletes (other agents share this DB).   node scripts/seed.mjs
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

const { scopes, people, memories } = await import(pathToFileURL(path.join(root, "src/mocks/data.ts")).href);

// uuid v5-style (sha1, namespaced) so the same slug always maps to the same id.
const NS = "hivemind:memory:";
export function slugUuid(slug) {
  const h = createHash("sha1").update(NS + slug).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const memId = (m) => (UUID_RE.test(m.id) ? m.id : slugUuid(m.slug));
// invalidatedBy in mocks is a slug (or mem-<slug> / uuid)
const refId = (ref) => (!ref ? null : UUID_RE.test(ref) ? ref : slugUuid(ref.replace(/^mem-/, "")));

function check(label, { error }) {
  if (error) {
    console.error(`✗ ${label}:`, error.message);
    process.exit(1);
  }
}

check(
  "scopes",
  await sb.from("scopes").upsert(
    scopes.map((s) => ({ id: s.id, level: s.level, name: s.name, parent_id: s.parentId, owner: s.owner ?? null })),
    { onConflict: "id" },
  ),
);

check(
  "people",
  await sb.from("people").upsert(
    people.map((p) => ({ id: p.id, name: p.name, role: p.role, scope_id: p.scopeId, title: p.title })),
    { onConflict: "id" },
  ),
);

const rows = memories.map((m) => ({
  id: memId(m),
  scope_id: m.scopeId,
  kind: m.kind,
  title: m.title,
  body: m.body,
  slug: m.slug,
  locked: m.locked,
  status: m.status,
  source: m.source,
  author: m.author,
  evidence: m.evidence,
  alpha: m.alpha,
  beta: m.beta,
  status_reason: m.blockedReason ?? null,
  expires_at: m.expiresAt ?? null,
  invalidated_by: null, // second pass (self-FK)
  created_at: m.createdAt,
  updated_at: m.updatedAt,
}));
check("memories", await sb.from("memories").upsert(rows, { onConflict: "id" }));

for (const m of memories.filter((m) => m.invalidatedBy)) {
  check(`invalidated_by ${m.slug}`, await sb.from("memories").update({ invalidated_by: refId(m.invalidatedBy) }).eq("id", memId(m)));
}

const count = async (t) => (await sb.from(t).select("*", { count: "exact", head: true })).count;
console.log(
  `✓ seeded ${scopes.length} scopes, ${people.length} people, ${rows.length} memories → DB now has`,
  { scopes: await count("scopes"), people: await count("people"), memories: await count("memories") },
);
