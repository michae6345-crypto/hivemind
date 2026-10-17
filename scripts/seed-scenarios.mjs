#!/usr/bin/env node
// Extra demo depth on top of scripts/seed.mjs: realistic lessons/directives for Meridian Data (fictional AI training-data
// + evals company; customers are "Lab A" / "Lab B"). Run AFTER seed.mjs. Idempotent upserts, never deletes.
//   node scripts/seed-scenarios.mjs
// reset-demo can `import { SCENARIO_SLUGS } from "./seed-scenarios.mjs"` (importing does not write; only running does).
//
// Pack budget note (src/lib/engine/pack.ts): locked rules bypass the 6000-char budget and non-locked directives fill
// before lessons. So: no new locked rules, only two directives in the #repo/export-service chain, and chain lessons are
// weighted (alpha/beta) to rank below the demo's approved [[export-assert-single-customer]] so it always makes the pack.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d) => minutesAgo(d * 24 * 60);

export const scenarioScopes = [
  { id: "repo/labeling-api", level: "repo", name: "labeling-api", parentId: "team/expert-platform", owner: "tom" },
  { id: "personal/omar", level: "personal", name: "omar", parentId: "team/expert-platform", owner: "omar" },
  // Sandbox repo for live experiments (agent G's playground/). reset-demo leaves its activity/events/memories alone.
  { id: "repo/playground", level: "repo", name: "playground", parentId: "team/data-pipelines", owner: "ben" },
];

export const scenarioPeople = [
  { id: "omar", name: "Omar Reed", role: "engineer", scopeId: "team/expert-platform", title: "Engineer, Expert Platform" },
  { id: "dana", name: "Dana Brooks", role: "engineer", scopeId: "org", title: "Site Reliability Engineer" },
];

const ev = (type, actor, days, ref, quote) => ({ type, quote, actor, at: daysAgo(days), ref });

/** @type {Array<{slug:string, scopeId:string, kind:string, title:string, body:string, locked?:boolean, status:string,
 *   source:string, author:string, evidence:object[], alpha:number, beta:number, blockedReason?:string, invalidatedBy?:string}>} */
export const scenarioMemories = [
  // ── #org ─────────────────────────────────────────────────────────────────
  {
    slug: "tenant-id-every-query",
    scopeId: "org",
    kind: "directive",
    title: "Every query on tenant tables filters by tenant_id",
    body:
      "Go through `db.forTenant(tenantId)` for any table with a `tenant_id` column. Raw `db.query()` on tenant tables fails review, " +
      "and the `tenant_isolation` RLS policy is the backstop, not the plan. Enforces 🔒 [[sec-lab-isolation]]. Owner: @greg.",
    status: "active",
    source: "review",
    author: "greg",
    evidence: [
      ev("manual", "greg", 34, "INC-2291 postmortem", "A dashboard query without a tenant_id filter returned Lab B task counts to a Lab A admin for 41 minutes. Every tenant query goes through forTenant()."),
      ev("review_comment", "ben", 21, "meridian/labeling-api#733", "this SELECT on task_assignments has no tenant_id predicate — use db.forTenant(), same as INC-2291"),
    ],
    alpha: 9,
    beta: 1,
  },
  {
    slug: "structured-log-fields",
    scopeId: "org",
    kind: "lesson",
    title: "Log lines carry trace_id, tenant_id, job_id; expert ids are HMACed",
    body:
      "Every `logger` call includes `trace_id`, `tenant_id` and `job_id`. Any expert identifier is logged as `hmacExpertId(id)` " +
      "(HMAC-SHA256 keyed with the `EXPERT_ID_PEPPER` secret), never raw. See [[use-logger]] and 🔒 [[sec-no-pii-logs]]. Owner: @dana.",
    status: "active",
    source: "review",
    author: "dana",
    evidence: [
      ev("manual", "dana", 19, "Datadog incident DD-4471", "Couldn't correlate the export stall across 3 services: half the lines had no trace_id. Required fields from now on."),
      ev("review_comment", "greg", 11, "meridian/expert-portal#522", "sha256(expert_id) is reversible by brute force over our id space. HMAC with the pepper."),
    ],
    alpha: 5,
    beta: 1,
  },
  {
    slug: "zod-strict-boundaries",
    scopeId: "org",
    kind: "lesson",
    title: "Parse API inputs with zod .strict() at the boundary",
    body:
      "Route handlers and queue consumers parse input with a zod schema using `.strict()`, so unknown keys are rejected instead of silently " +
      "passed into `insert()`. Parse once at the edge; internal functions take the typed result.",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 16, "meridian/labeling-api#701", "a client sent `tenant_id` in the body and we spread it straight into the insert. .strict() at the boundary."),
      ev("correction", "kevin", 8, "session s-071", "use the zod schema with .strict(), don't hand-check fields"),
    ],
    alpha: 4,
    beta: 1,
  },
  {
    slug: "expand-contract-migrations",
    scopeId: "org",
    kind: "lesson",
    title: "Schema changes use expand/contract, never rename in place",
    body:
      "Add the new column, dual-write, backfill, switch reads, then drop the old column in a later release. " +
      "Never rename or retype a live column in one migration. Builds on [[migrations-append-only]]. Owner: @ben.",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("manual", "dana", 27, "INC-2307", "Renaming payouts.amount → amount_cents in one deploy broke the old pods for 6 minutes during rollout."),
      ev("review_comment", "ben", 13, "DATA-1302", "split this into expand (add + dual-write) and contract (drop) — two PRs, two deploys"),
    ],
    alpha: 5,
    beta: 1,
  },

  // ── #team/data-pipelines + #repo/dataset-builder ─────────────────────────
  {
    slug: "skip-locked-job-queue",
    scopeId: "team/data-pipelines",
    kind: "lesson",
    title: "Job workers claim rows with FOR UPDATE SKIP LOCKED",
    body:
      "Claim queue rows with `SELECT … FOR UPDATE SKIP LOCKED LIMIT n` inside the claiming transaction. " +
      "Read-then-update let two workers grab the same export job.",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 9, "meridian/export-service#401", "two workers picked up job 88123 — claim with FOR UPDATE SKIP LOCKED, not select-then-update"),
    ],
    alpha: 3,
    beta: 1,
  },
  {
    slug: "embedding-batch-96",
    scopeId: "repo/dataset-builder",
    kind: "lesson",
    title: "Embedding calls: batches of at most 96, cached by sha256",
    body:
      "Near-duplicate detection embeds in batches of ≤ 96 inputs (provider limit), and caches vectors keyed by `sha256(model + text)`. " +
      "Re-embedding unchanged rows tripled last month's embedding bill.",
    status: "active",
    source: "correction",
    author: "kevin",
    evidence: [
      ev("correction", "kevin", 6, "session s-083", "batch size has to be 96 max or the provider 400s, and check the sha256 cache first"),
      ev("manual", "ben", 5, "DATA-1311", "Embedding spend 3.1x MoM; 72% of calls were cache-missable re-embeds."),
    ],
    alpha: 4,
    beta: 1,
  },
  {
    slug: "export-partition-by-tenant",
    scopeId: "team/data-pipelines",
    kind: "lesson",
    title: "Partition export objects by tenant_id/date",
    body:
      "Write export objects under `s3://meridian-exports/{tenant_id}/{yyyy-mm-dd}/` so a prefix never spans two lab customers. " +
      "Supports 🔒 [[sec-lab-isolation]].",
    status: "pending",
    source: "correction",
    author: "emily",
    evidence: [
      ev("correction", "emily", 0.02, "session s-109", "put the tenant_id first in the key path, we grant bucket access per prefix"),
    ],
    alpha: 1.5,
    beta: 1,
  },

  // ── #repo/export-service ─────────────────────────────────────────────────
  {
    slug: "presigned-url-15min",
    scopeId: "repo/export-service",
    kind: "directive",
    title: "Presigned export URLs expire in 15 minutes and cover one key",
    body:
      "Generate S3 presigned GET URLs per object key with `expiresIn` ≤ 900 s. No prefix-wide or multi-day links; " +
      "labs re-request through the delivery API. Owner: @greg.",
    status: "active",
    source: "review",
    author: "greg",
    evidence: [
      ev("manual", "greg", 29, "Pentest PT-2026-04 finding M-3", "7-day presigned URLs to Lab A deliveries were found in a shared Slack channel."),
      ev("review_comment", "greg", 24, "meridian/export-service#398", "expiresIn: 604800 → 900, and one key per URL"),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "export-v2-flag-dual-write",
    scopeId: "repo/export-service",
    kind: "lesson",
    title: "Export format changes ship behind export-v2 with 2 weeks of dual-write",
    body:
      "Gate any change to the delivered file format behind the LaunchDarkly flag `export-v2` and write v1 and v2 side by side for two weeks " +
      "before removing v1. Labs pin parsers to our format. Ask @ben first ([[owner-export-service]]).",
    status: "pending",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 0.08, "meridian/export-service#412", "this changes the JSONL field order Lab B parses — put it behind export-v2 and dual-write for 2 weeks"),
    ],
    alpha: 2,
    beta: 1,
  },

  // ── #team/expert-platform + #repo/labeling-api ───────────────────────────
  {
    slug: "stripe-webhook-idempotent",
    scopeId: "team/expert-platform",
    kind: "lesson",
    title: "Stripe payout webhooks are idempotent on event.id",
    body:
      "Insert `event.id` into `processed_webhooks` (unique) in the same transaction as the payout update; on conflict, return 200 and stop. " +
      "Stripe retries deliveries. Amounts per [[money-integer-cents]]. Owner: @tom.",
    status: "active",
    source: "review",
    author: "tom",
    evidence: [
      ev("manual", "tom", 26, "INC-2264", "A Stripe retry storm double-paid 14 experts ($3,180 total) on a Friday payout run."),
      ev("review_comment", "tom", 25, "meridian/expert-portal#517", "dedupe on event.id in processed_webhooks, same txn as the payout row"),
    ],
    alpha: 7,
    beta: 1,
  },
  {
    slug: "labeler-api-backoff",
    scopeId: "repo/labeling-api",
    kind: "lesson",
    title: "Labeler API clients retry 429/503 with full-jitter backoff",
    body:
      "Retry only 429 and 503: exponential backoff with full jitter (base 500 ms, cap 30 s), max 5 attempts, and honor `Retry-After` when present. " +
      "Never retry 4xx validation errors. Replaces [[labeler-retry-fixed]].",
    status: "active",
    source: "correction",
    author: "omar",
    evidence: [
      ev("manual", "dana", 15, "Datadog monitor labeling-api.429_rate > 5%", "Fixed 1 s retries from 40 workers synchronized into waves and kept us rate-limited for 25 min."),
      ev("correction", "omar", 14, "DATA-1287", "full jitter, max 5 attempts, and read Retry-After — fixed sleeps make it worse"),
      ev("correction", "kevin", 4, "session s-090", "no, back off with jitter and respect Retry-After on 429s"),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "labeler-retry-fixed",
    scopeId: "repo/labeling-api",
    kind: "lesson",
    title: "Retry labeler calls every 1s until they succeed",
    body: "On any labeler API error, sleep 1 s and retry until it succeeds.",
    status: "invalid",
    source: "correction",
    author: "omar",
    evidence: [ev("correction", "omar", 40, "session s-022", "just retry it every second, it'll go through")],
    alpha: 1,
    beta: 4,
    invalidatedBy: "labeler-api-backoff",
  },
  {
    slug: "labeling-api-cursor-pagination",
    scopeId: "repo/labeling-api",
    kind: "fact",
    title: "List endpoints use cursor pagination (max 500 per page)",
    body: "`GET /tasks` and `/assignments` page with an opaque `after` cursor, max `limit=500`. Offset pagination timed out on Lab A's 2M-task project.",
    status: "active",
    source: "review",
    author: "tom",
    evidence: [ev("review_comment", "tom", 17, "meridian/labeling-api#689", "OFFSET 1900000 is a seq scan — cursor on (created_at, id)")],
    alpha: 4,
    beta: 1,
  },
  {
    slug: "labeling-api-idempotency-key",
    scopeId: "repo/labeling-api",
    kind: "lesson",
    title: "POST /tasks requires an Idempotency-Key header",
    body: "Clients send `Idempotency-Key` on task creation; the API stores the key for 24 h and replays the first response on retries.",
    status: "pending",
    source: "agent",
    author: "agent:s-118",
    evidence: [ev("agent", "agent:s-118", 0.03, "session s-118", "Proposed after a retried batch created 312 duplicate tasks in staging during this session.")],
    alpha: 1.3,
    beta: 1,
  },
  {
    slug: "log-expert-email-on-payout-failure",
    scopeId: "team/expert-platform",
    kind: "lesson",
    title: "Log the expert's email when a payout fails",
    body: "Include the expert's email in payout failure logs so support can find them quickly.",
    status: "blocked",
    source: "correction",
    author: "omar",
    evidence: [ev("correction", "omar", 0.05, "session s-117", "just log their email on payout failures, support keeps asking who it was")],
    alpha: 1.5,
    beta: 1,
    blockedReason: "Contradicts 🔒 [[sec-no-pii-logs]] (Greg, Security): log hmacExpertId(id) and let support resolve it in the admin tool.",
  },

  // ── #team/evals + #repo/eval-harness ─────────────────────────────────────
  {
    slug: "pin-model-snapshots",
    scopeId: "team/evals",
    kind: "directive",
    title: "Eval runs pin dated model snapshots, never aliases",
    body:
      "Every run config names a dated snapshot ID. `-latest` and other moving aliases are rejected by `harness validate`. " +
      "Results without a pinned snapshot can't go into a customer report. Owner: @lauren.",
    status: "active",
    source: "human",
    author: "lauren",
    evidence: [
      ev("manual", "lauren", 23, "EVAL-412", "Lab B's coding suite jumped 6 points overnight with no task changes — the alias had moved to a new snapshot."),
    ],
    alpha: 8,
    beta: 1,
  },
  {
    slug: "kappa-gate",
    scopeId: "team/evals",
    kind: "directive",
    title: "Cohen's κ below 0.6 blocks a dataset from shipping",
    body:
      "Every labeled dataset reports inter-annotator agreement on its 10% double-labeled overlap. κ < 0.6 blocks the release; " +
      "fix the rubric or re-label first. Owner: @lauren.",
    status: "active",
    source: "human",
    author: "lauren",
    evidence: [
      ev("manual", "lauren", 30, "Quality policy QP-7", "We shipped a preference set at κ = 0.41; Lab A's reward model learned our rubric ambiguity."),
      ev("review_comment", "nick", 10, "meridian/eval-harness#256", "kappa is 0.52 on the overlap — this can't ship until the rubric is fixed"),
    ],
    alpha: 7,
    beta: 1,
  },
  {
    slug: "contamination-check-13gram",
    scopeId: "repo/eval-harness",
    kind: "lesson",
    title: "New tasks pass a 13-gram contamination check before entering the pool",
    body:
      "Run `harness contam` on every new task: any 13-gram overlap with the public-benchmark index sends it back to the author. " +
      "Contaminated tasks overstate model scores. Taught by @nick.",
    status: "active",
    source: "correction",
    author: "nick",
    evidence: [
      ev("correction", "nick", 12, "session s-076", "run the 13-gram contamination check before adding tasks, two of these are verbatim from a public set"),
      ev("review_comment", "lauren", 7, "meridian/eval-harness#261", "contam check missing from the CI step — add it"),
    ],
    alpha: 5,
    beta: 1,
  },

  // ── #repo/playground (sandbox; each lesson is easy to trip from sandbox code) ──
  {
    slug: "playground-tenant-filter",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Tenant tables are only read through forTenant(tenantId)",
    body:
      "Any query touching `tasks`, `exports` or `payouts` goes through `db.forTenant(tenantId)`, never a bare `db.query()` or a " +
      "`WHERE` without `tenant_id`. Repo copy of [[tenant-id-every-query]]; enforces 🔒 [[sec-lab-isolation]].",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 6, "meridian/playground#14", "listExports() selects from exports with no tenant_id — that's exactly INC-2291. forTenant()."),
      ev("correction", "kevin", 2, "session s-121", "no, don't query exports directly, go through db.forTenant(tenantId)"),
    ],
    alpha: 7,
    beta: 1,
  },
  {
    slug: "playground-stripe-idempotent",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Stripe webhook handler dedupes on event.id before paying out",
    body:
      "The `payout.paid` / `transfer.created` handler inserts `event.id` into `processed_webhooks` in the same transaction as the payout row " +
      "and returns 200 on conflict. Stripe redelivers. See [[stripe-webhook-idempotent]].",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 5, "meridian/playground#17", "replaying the same Stripe event pays twice here — insert event.id into processed_webhooks first (INC-2264)"),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "playground-retry-jitter",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Labeler client retries 429/503 with full jitter, max 5, honors Retry-After",
    body:
      "`fetchWithRetry` retries only 429 and 503, sleeping `random(0, min(30s, 500ms·2^attempt))`, max 5 attempts, and uses `Retry-After` when sent. " +
      "No fixed `sleep(1000)` loops. See [[labeler-api-backoff]].",
    status: "active",
    source: "correction",
    author: "emily",
    evidence: [
      ev("correction", "emily", 3, "session s-124", "that while(true) sleep(1000) loop is how we got rate-limited for 25 min — full jitter, 5 tries, read Retry-After"),
      ev("review_comment", "ben", 3, "DATA-1287", "also don't retry 400s, they'll never succeed"),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "playground-presign-15min",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "presignExport() caps expiresIn at 900 seconds, one key per URL",
    body:
      "Presigned export links are per object key with `expiresIn` ≤ 900. Never presign a prefix or hand out multi-day links. " +
      "See [[presigned-url-15min]]. Owner: @greg.",
    status: "active",
    source: "review",
    author: "greg",
    evidence: [
      ev("review_comment", "greg", 4, "meridian/playground#19", "expiresIn: 86400 → 900. Pentest PT-2026-04 M-3 was exactly this."),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "playground-log-trace-id",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Use logger with trace_id, tenant_id, job_id; never console.log",
    body:
      "Log through `logger.info(msg, { trace_id, tenant_id, job_id })`. No `console.log`, and expert ids only as `hmacExpertId(id)`. " +
      "See [[structured-log-fields]], [[use-logger]], 🔒 [[sec-no-pii-logs]].",
    status: "active",
    source: "correction",
    author: "kevin",
    evidence: [
      ev("correction", "kevin", 2, "session s-122", "use logger, and pass trace_id/tenant_id/job_id — console.log skips the PII scrubber"),
      ev("manual", "dana", 9, "Datadog incident DD-4471", "Half the export logs had no trace_id; we couldn't follow one job across services."),
    ],
    alpha: 6,
    beta: 1,
  },
  {
    slug: "playground-zod-strict",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Route handlers parse bodies with a .strict() zod schema",
    body:
      "Every handler starts with `Schema.strict().parse(await req.json())` and passes only the parsed value on. " +
      "No `{ ...body }` spreads into inserts. See [[zod-strict-boundaries]].",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 4, "meridian/playground#21", "a client can send tenant_id in this body and it lands in the insert — .strict() schema, then pick fields"),
    ],
    alpha: 5,
    beta: 1,
  },
  {
    slug: "playground-amount-cents",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Payout amounts are integer amount_cents end to end",
    body:
      "Payout and invoice math uses integer `amount_cents`; format to dollars only in the UI. No `parseFloat`, no `/ 100` in services. " +
      "See [[money-integer-cents]].",
    status: "active",
    source: "correction",
    author: "emily",
    evidence: [
      ev("correction", "emily", 3, "session s-123", "amounts are cents ints — don't divide by 100 in the payout service"),
    ],
    alpha: 5,
    beta: 1,
  },
  {
    slug: "playground-skip-locked",
    scopeId: "repo/playground",
    kind: "lesson",
    title: "Job claims use FOR UPDATE SKIP LOCKED",
    body:
      "`claimJobs(n)` selects queued rows with `FOR UPDATE SKIP LOCKED LIMIT n` and marks them running in the same transaction. " +
      "See [[skip-locked-job-queue]].",
    status: "active",
    source: "review",
    author: "ben",
    evidence: [
      ev("review_comment", "ben", 5, "meridian/playground#16", "two workers will grab the same job with select-then-update — SKIP LOCKED"),
    ],
    alpha: 4,
    beta: 1,
  },
];

export const SCENARIO_SLUGS = scenarioMemories.map((m) => m.slug);

// Same deterministic id scheme as seed.mjs (uuid v5-style sha1 over a namespace + slug).
export function slugUuid(slug) {
  const h = createHash("sha1").update("hivemind:memory:" + slug).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const check = (label, { error }) => {
    if (error) {
      console.error(`✗ ${label}:`, error.message);
      process.exit(1);
    }
  };

  const { count: base } = await sb.from("scopes").select("*", { count: "exact", head: true }).eq("id", "team/expert-platform");
  if (!base) throw new Error("Base seed missing — run `node scripts/seed.mjs` first.");

  check("scopes", await sb.from("scopes").upsert(
    scenarioScopes.map((s) => ({ id: s.id, level: s.level, name: s.name, parent_id: s.parentId, owner: s.owner })), { onConflict: "id" }));
  check("people", await sb.from("people").upsert(
    scenarioPeople.map((p) => ({ id: p.id, name: p.name, role: p.role, scope_id: p.scopeId, title: p.title })), { onConflict: "id" }));

  const rows = scenarioMemories.map((m) => {
    const ats = m.evidence.map((e) => e.at).sort();
    return {
      id: slugUuid(m.slug),
      scope_id: m.scopeId,
      kind: m.kind,
      title: m.title,
      body: m.body,
      slug: m.slug,
      locked: !!m.locked,
      status: m.status,
      source: m.source,
      author: m.author,
      evidence: m.evidence,
      alpha: m.alpha,
      beta: m.beta,
      status_reason: m.blockedReason ?? null,
      expires_at: null,
      invalidated_by: null, // second pass (self-FK)
      created_at: ats[0] ?? minutesAgo(1),
      updated_at: ats.at(-1) ?? minutesAgo(1),
    };
  });
  check("memories", await sb.from("memories").upsert(rows, { onConflict: "id" }));
  for (const m of scenarioMemories.filter((m) => m.invalidatedBy)) {
    check(`invalidated_by ${m.slug}`, await sb.from("memories").update({ invalidated_by: slugUuid(m.invalidatedBy) }).eq("id", slugUuid(m.slug)));
  }

  const by = (s) => rows.filter((r) => r.status === s).length;
  console.log(
    `✓ scenarios: ${scenarioScopes.length} scopes, ${scenarioPeople.length} people, ${rows.length} memories ` +
      `(${by("active")} active, ${by("pending")} pending, ${by("blocked")} blocked, ${by("invalid")} invalid)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
