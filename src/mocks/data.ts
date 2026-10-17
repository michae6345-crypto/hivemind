// Demo company seed for the UI — fictional "Meridian Data", an AI training-data
// startup "like AfterQuery". Lab A / Lab B are made-up customers. PLAN.md §7.
// Mirrors what supabase/seed.sql should contain, so the UI looks the same
// whether it reads mocks or the real API.

import type {
  ActivityItem,
  FeedEvent,
  Memory,
  Metrics,
  Person,
  Scope,
} from "./types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

export const ORG_NAME = "Meridian Data";

export const scopes: Scope[] = [
  { id: "org", level: "org", name: "Meridian Data", parentId: null, owner: "maya" },
  { id: "team/expert-platform", level: "team", name: "expert-platform", parentId: "org", owner: "sam" },
  { id: "team/data-pipelines", level: "team", name: "data-pipelines", parentId: "org", owner: "jordan" },
  { id: "team/evals", level: "team", name: "evals", parentId: "org", owner: "priya" },
  { id: "repo/dataset-builder", level: "repo", name: "dataset-builder", parentId: "team/data-pipelines", owner: "jordan" },
  { id: "repo/export-service", level: "repo", name: "export-service", parentId: "team/data-pipelines", owner: "jordan" },
  { id: "repo/eval-harness", level: "repo", name: "eval-harness", parentId: "team/evals", owner: "priya" },
  { id: "repo/expert-portal", level: "repo", name: "expert-portal", parentId: "team/expert-platform", owner: "sam" },
  { id: "personal/alex", level: "personal", name: "alex", parentId: "team/data-pipelines", owner: "alex" },
  { id: "personal/noor", level: "personal", name: "noor", parentId: "team/data-pipelines", owner: "noor" },
];

export const people: Person[] = [
  { id: "maya", name: "Maya Chen", role: "security", scopeId: "org", title: "Head of Security" },
  { id: "jordan", name: "Jordan Reyes", role: "lead", scopeId: "team/data-pipelines", title: "Data Pipelines Lead" },
  { id: "priya", name: "Priya Nair", role: "lead", scopeId: "team/evals", title: "Evals Lead" },
  { id: "sam", name: "Sam Okafor", role: "lead", scopeId: "team/expert-platform", title: "Expert Platform Lead" },
  { id: "alex", name: "Alex Kim", role: "engineer", scopeId: "team/data-pipelines", title: "Engineer, Data Pipelines" },
  { id: "noor", name: "Noor Haddad", role: "engineer", scopeId: "team/data-pipelines", title: "Engineer, Data Pipelines" },
  { id: "riley", name: "Riley Brooks", role: "engineer", scopeId: "team/evals", title: "Engineer, Evals" },
];

type Seed = Omit<Memory, "createdAt" | "updatedAt" | "id"> & { id?: string; ageDays: number };

const seed: Seed[] = [
  // ── Org: locked directives (Security) ────────────────────────────────────
  {
    slug: "sec-lab-isolation",
    scopeId: "org",
    kind: "directive",
    title: "Never mix data from different lab customers",
    body:
      "🔒 Never combine **Lab A** and **Lab B** data in one export, dataset, eval set or pipeline run.\n\n" +
      "Every export must pass `assertSingleCustomer(rows)` before it writes. Test fixtures included.\n\n" +
      "Owner: @maya. Applies to #org and everything below it.",
    locked: true,
    status: "active",
    source: "human",
    author: "maya",
    evidence: [
      { type: "manual", quote: "Customer isolation is a contract term with every lab. No exceptions, including test data.", actor: "maya", at: daysAgo(40), ref: "Security policy v3" },
    ],
    alpha: 30,
    beta: 1,
    ageDays: 40,
  },
  {
    slug: "sec-no-pii-logs",
    scopeId: "org",
    kind: "directive",
    title: "Never log expert personal info",
    body:
      "🔒 Expert names, emails and payout details live only in the `pii` schema.\n\n" +
      "Never write them to logs, traces, error messages or analytics events. Log the `expert_id` instead.\n\n" +
      "Owner: @maya.",
    locked: true,
    status: "active",
    source: "human",
    author: "maya",
    evidence: [
      { type: "manual", quote: "A stack trace with an expert's email reached our error tracker. Never again.", actor: "maya", at: daysAgo(31), ref: "Incident INC-27" },
    ],
    alpha: 24,
    beta: 1,
    ageDays: 31,
  },

  // ── Org lessons ──────────────────────────────────────────────────────────
  {
    slug: "money-integer-cents",
    scopeId: "org",
    kind: "lesson",
    title: "Money and payouts are integer cents",
    body:
      "Store and compute every payout as integer cents (`amount_cents`). Never floats, never dollars.\n\n" +
      "Learned from @jordan's review on #repo/export-service. Related: [[export-idempotent]].",
    locked: false,
    status: "active",
    source: "review",
    author: "jordan",
    evidence: [
      { type: "review_comment", quote: "payout_total is a float here — we've been off by a cent on 3% of invoices. Integer cents, always.", actor: "jordan", at: daysAgo(12), ref: "export-service#388" },
      { type: "correction", quote: "no, amounts are cents ints, don't divide by 100 until display", actor: "noor", at: daysAgo(6), ref: "session s-061" },
    ],
    alpha: 9,
    beta: 1,
    ageDays: 12,
  },
  {
    slug: "use-logger",
    scopeId: "org",
    kind: "lesson",
    title: "Use logger, not console.log",
    body:
      "Use the shared `logger` (structured, PII-scrubbed). `console.log` bypasses scrubbing and breaks 🔒 [[sec-no-pii-logs]].\n\n" +
      "First taught by @alex, confirmed by @riley on #team/evals.",
    locked: false,
    status: "active",
    source: "correction",
    author: "alex",
    evidence: [
      { type: "correction", quote: "don't use console.log, use our logger — it scrubs PII", actor: "alex", at: daysAgo(9), ref: "session s-048" },
      { type: "correction", quote: "logger please, not console", actor: "riley", at: daysAgo(4), ref: "session s-072" },
    ],
    alpha: 11,
    beta: 2,
    ageDays: 9,
  },
  {
    slug: "migrations-append-only",
    scopeId: "org",
    kind: "lesson",
    title: "Migrations are append-only",
    body:
      "Never edit a migration that has run anywhere. Add a new one.\n\nOwner: @jordan.",
    locked: false,
    status: "active",
    source: "review",
    author: "jordan",
    evidence: [
      { type: "review_comment", quote: "0007 already ran in staging — editing it will desync every env. New migration instead.", actor: "jordan", at: daysAgo(15), ref: "dataset-builder#201" },
    ],
    alpha: 7,
    beta: 1,
    ageDays: 15,
  },

  // ── team/data-pipelines ──────────────────────────────────────────────────
  {
    slug: "export-assert-single-customer",
    scopeId: "team/data-pipelines",
    kind: "lesson",
    title: "Every export calls assertSingleCustomer()",
    body:
      "Call `assertSingleCustomer(rows)` before writing any export file. It throws if rows from more than one lab customer are present.\n\n" +
      "Enforces 🔒 [[sec-lab-isolation]] in #repo/export-service and #repo/dataset-builder.",
    locked: false,
    status: "pending",
    source: "correction",
    author: "alex",
    evidence: [
      { type: "correction", quote: "No — exports must call assertSingleCustomer() before writing, or we risk mixing Lab A and Lab B rows.", actor: "alex", at: minutesAgo(3), ref: "session s-104" },
    ],
    alpha: 2,
    beta: 1,
    ageDays: 0,
  },
  {
    slug: "tag-lab-customer-id",
    scopeId: "team/data-pipelines",
    kind: "lesson",
    title: "Tag every row with lab_customer_id",
    body:
      "Every row that enters a pipeline carries `lab_customer_id`. Pipelines reject untagged rows instead of guessing.\n\n" +
      "Makes 🔒 [[sec-lab-isolation]] checkable in code.",
    locked: false,
    status: "active",
    source: "review",
    author: "jordan",
    evidence: [
      { type: "review_comment", quote: "If we can't tell which lab a row belongs to, we can't prove isolation. Reject untagged.", actor: "jordan", at: daysAgo(20), ref: "dataset-builder#177" },
    ],
    alpha: 8,
    beta: 1,
    ageDays: 20,
  },
  {
    slug: "owner-export-service",
    scopeId: "team/data-pipelines",
    kind: "owner",
    title: "Ask @jordan about export-service",
    body: "@jordan owns #repo/export-service. Ping before changing the export format or schedule.",
    locked: false,
    status: "active",
    source: "human",
    author: "jordan",
    evidence: [],
    alpha: 4,
    beta: 1,
    ageDays: 25,
  },

  // ── repo/export-service ──────────────────────────────────────────────────
  {
    slug: "export-idempotent",
    scopeId: "repo/export-service",
    kind: "lesson",
    title: "Export jobs are idempotent, keyed by job_id",
    body:
      "Re-running an export with the same `job_id` must produce the same files and never duplicate rows.\n\nSee [[money-integer-cents]] for totals.",
    locked: false,
    status: "active",
    source: "review",
    author: "jordan",
    evidence: [
      { type: "review_comment", quote: "retries doubled the rows in Lab A's delivery last month. key on job_id.", actor: "jordan", at: daysAgo(18), ref: "export-service#352" },
    ],
    alpha: 6,
    beta: 1,
    ageDays: 18,
  },
  {
    slug: "stream-uploads",
    scopeId: "repo/export-service",
    kind: "lesson",
    title: "Stream uploads; never buffer a full export",
    body: "Stream export files to storage in chunks. Buffering a full export OOM-killed the worker twice.",
    locked: false,
    status: "active",
    source: "correction",
    author: "noor",
    evidence: [
      { type: "correction", quote: "don't read the whole export into memory, stream it", actor: "noor", at: daysAgo(7), ref: "session s-066" },
    ],
    alpha: 4,
    beta: 1,
    ageDays: 7,
  },
  {
    slug: "zod-export-config",
    scopeId: "repo/export-service",
    kind: "lesson",
    title: "Validate export configs with zod",
    body: "Parse export configs with a zod schema at load time so bad configs fail before a job starts.",
    locked: false,
    status: "pending",
    source: "agent",
    author: "agent:s-101",
    evidence: [
      { type: "agent", quote: "Proposed after three config typos caused failed jobs in this session.", actor: "agent:s-101", at: minutesAgo(22), ref: "session s-101" },
    ],
    alpha: 1.3,
    beta: 1,
    ageDays: 0,
  },

  // ── repo/dataset-builder ─────────────────────────────────────────────────
  {
    slug: "use-pnpm",
    scopeId: "repo/dataset-builder",
    kind: "lesson",
    title: "Use pnpm, not npm",
    body: "This repo uses `pnpm`. Running `npm install` creates a second lockfile and breaks CI.",
    locked: false,
    status: "active",
    source: "correction",
    author: "noor",
    evidence: [
      { type: "correction", quote: "we use pnpm here, delete that package-lock", actor: "noor", at: daysAgo(10), ref: "session s-052" },
    ],
    alpha: 6,
    beta: 1,
    ageDays: 10,
  },
  {
    slug: "use-npm",
    scopeId: "repo/dataset-builder",
    kind: "lesson",
    title: "Use npm for dataset-builder",
    body: "Install with `npm install`.",
    locked: false,
    status: "invalid",
    source: "correction",
    author: "alex",
    evidence: [
      { type: "correction", quote: "just npm install it", actor: "alex", at: daysAgo(11), ref: "session s-050" },
    ],
    alpha: 1,
    beta: 4,
    invalidatedBy: "use-pnpm",
    ageDays: 11,
  },
  {
    slug: "snapshot-after-model-change",
    scopeId: "repo/dataset-builder",
    kind: "fact",
    title: "Regenerate schema snapshots after model changes",
    body: "After changing any model in `models/`, run `pnpm snap` or CI fails on the snapshot diff.",
    locked: false,
    status: "active",
    source: "correction",
    author: "alex",
    evidence: [
      { type: "correction", quote: "you need to run pnpm snap after touching models", actor: "alex", at: daysAgo(5), ref: "session s-069" },
    ],
    alpha: 3,
    beta: 1,
    ageDays: 5,
  },

  // ── team/evals + repo/eval-harness ───────────────────────────────────────
  {
    slug: "grader-negative-test",
    scopeId: "team/evals",
    kind: "lesson",
    title: "Every grader ships with a subtly-wrong solution test",
    body:
      "Test each grader against the reference solution **and** a subtly-wrong one. A grader that passes the wrong one is too wide.\n\n" +
      "Taught by @riley; owner @priya.",
    locked: false,
    status: "active",
    source: "correction",
    author: "riley",
    evidence: [
      { type: "correction", quote: "No, every grader needs a subtly-wrong solution test too, or it passes broken answers.", actor: "riley", at: daysAgo(3), ref: "session s-079" },
    ],
    alpha: 5,
    beta: 1,
    ageDays: 3,
  },
  {
    slug: "retire-saturated-tasks",
    scopeId: "team/evals",
    kind: "lesson",
    title: "Retire tasks above ~70% frontier pass rate",
    body: "Retire a task once frontier models pass it about 70% of the time; drop tasks below about 2–3%. Owner @priya.",
    locked: false,
    status: "active",
    source: "human",
    author: "priya",
    evidence: [
      { type: "manual", quote: "Saturated tasks teach nothing; impossible ones teach nothing either.", actor: "priya", at: daysAgo(22), ref: "Evals handbook" },
    ],
    alpha: 6,
    beta: 1,
    ageDays: 22,
  },
  {
    slug: "grader-timeout",
    scopeId: "repo/eval-harness",
    kind: "fact",
    title: "Graders time out at 30s per test case",
    body: "Each grader test case has a 30 second budget. Long-running checks go in the nightly suite.",
    locked: false,
    status: "active",
    source: "human",
    author: "priya",
    evidence: [],
    alpha: 3,
    beta: 1,
    ageDays: 14,
  },

  // ── team/expert-platform ─────────────────────────────────────────────────
  {
    slug: "no-auto-ban-detectors",
    scopeId: "team/expert-platform",
    kind: "lesson",
    title: "Don't auto-ban experts on AI-detector scores",
    body: "AI-text detector scores are not reliable enough to act on alone. Route flags to human review in #repo/expert-portal.",
    locked: false,
    status: "active",
    source: "review",
    author: "sam",
    evidence: [
      { type: "review_comment", quote: "we can't ban on a detector score — false positives hit non-native writers hardest. Human review queue.", actor: "sam", at: daysAgo(16), ref: "expert-portal#90" },
    ],
    alpha: 5,
    beta: 1,
    ageDays: 16,
  },

  // ── Personal ─────────────────────────────────────────────────────────────
  {
    slug: "alex-small-prs",
    scopeId: "personal/alex",
    kind: "lesson",
    title: "Keep my PRs under 300 lines",
    body: "Split changes so each PR stays under ~300 lines.",
    locked: false,
    status: "active",
    source: "human",
    author: "alex",
    evidence: [],
    alpha: 3,
    beta: 1,
    ageDays: 8,
  },
  {
    slug: "noor-explain-diffs",
    scopeId: "personal/noor",
    kind: "lesson",
    title: "Explain the diff before applying it",
    body: "Summarize what will change and why before editing files.",
    locked: false,
    status: "active",
    source: "human",
    author: "noor",
    evidence: [],
    alpha: 3,
    beta: 1,
    ageDays: 6,
  },

  // ── Queue: blocked + pending ─────────────────────────────────────────────
  {
    slug: "mix-labs-in-tests",
    scopeId: "team/data-pipelines",
    kind: "lesson",
    title: "Mixing labs is fine for test fixtures",
    body: "Reuse Lab A's eval rows in Lab B's test fixtures to save time.",
    locked: false,
    status: "blocked",
    source: "correction",
    author: "noor",
    evidence: [
      { type: "correction", quote: "just reuse Lab A's rows for the Lab B fixtures, it's only tests", actor: "noor", at: minutesAgo(1), ref: "session s-105" },
    ],
    alpha: 1.5,
    beta: 1,
    blockedReason: "Contradicts 🔒 [[sec-lab-isolation]] (Maya, Security): isolation applies to test fixtures too.",
    ageDays: 0,
  },
  {
    slug: "allsettled-fanout",
    scopeId: "repo/export-service",
    kind: "lesson",
    title: "Use Promise.allSettled for fan-out uploads",
    body: "When uploading to several destinations, use `Promise.allSettled` and report per-destination failures.",
    locked: false,
    status: "pending",
    source: "review",
    author: "jordan",
    evidence: [
      { type: "review_comment", quote: "one failed bucket shouldn't cancel the other uploads — allSettled + report", actor: "jordan", at: minutesAgo(48), ref: "export-service#415" },
    ],
    alpha: 2,
    beta: 1,
    ageDays: 0,
  },
];

export const memories: Memory[] = seed.map(({ ageDays, id, ...m }) => ({
  ...m,
  id: id ?? `mem-${m.slug}`,
  createdAt: daysAgo(ageDays),
  updatedAt: daysAgo(ageDays),
}));

export const feed: FeedEvent[] = [
  { id: "f1", type: "blocked", actor: "noor", text: "proposed a lesson that 🔒 [[sec-lab-isolation]] blocked", at: minutesAgo(1), memoryId: "mem-mix-labs-in-tests", repo: "dataset-builder" },
  { id: "f2", type: "correction", actor: "alex", text: "corrected an agent → pending lesson [[export-assert-single-customer]]", at: minutesAgo(3), memoryId: "mem-export-assert-single-customer", repo: "export-service" },
  { id: "f3", type: "collision", actor: "noor", text: "started editing export-service/src/export.ts while Alex's agent is in it", at: minutesAgo(5), repo: "export-service" },
  { id: "f4", type: "session_start", actor: "noor", text: "started a session: 9 lessons and 2 🔒 rules loaded (1.1k tokens)", at: minutesAgo(9), repo: "dataset-builder" },
  { id: "f5", type: "transfer", actor: "riley", text: "got [[use-logger]] right on the first try, taught by Alex", at: minutesAgo(26), memoryId: "mem-use-logger", repo: "eval-harness" },
  { id: "f6", type: "review_comment", actor: "jordan", text: "left a review comment → pending lesson [[allsettled-fanout]]", at: minutesAgo(48), memoryId: "mem-allsettled-fanout", repo: "export-service" },
  { id: "f7", type: "approval", actor: "priya", text: "approved [[grader-negative-test]] for #team/evals", at: minutesAgo(70), memoryId: "mem-grader-negative-test" },
  { id: "f8", type: "deny", actor: "alex", text: "had a copy from data/lab_a into data/lab_b denied by 🔒 [[sec-lab-isolation]]", at: minutesAgo(95), repo: "dataset-builder" },
];

export const activity: ActivityItem[] = [
  { id: "a1", sessionId: "s-105", actor: "noor", repo: "export-service", file: "src/export.ts", createdAt: minutesAgo(2), warning: "Alex's agent edited this file 3 min ago" },
  { id: "a2", sessionId: "s-104", actor: "alex", repo: "export-service", file: "src/export.ts", createdAt: minutesAgo(5) },
  { id: "a3", sessionId: "s-103", actor: "riley", repo: "eval-harness", file: "graders/math.py", createdAt: minutesAgo(8) },
  { id: "a4", sessionId: "s-102", actor: "priya", repo: "eval-harness", file: "tasks/registry.yaml", createdAt: minutesAgo(14) },
];

// MOCK — replaced by GET /api/metrics (eval/results.json + session history).
// Shape only; do not present these numbers as results.
export const metrics: Metrics = {
  curve: [
    6, 5, 6, 5, 4, 5, 4, 4, 3, 4, 3, 3, 2, 3, 2, 2, 2, 1, 2, 1, 1, 1, 2, 1, 1, 0, 1, 1, 0, 1,
  ].map((corrections, i) => ({
    session: i + 1,
    corrections,
    lessonApproved:
      i === 3 ? "use-logger" : i === 8 ? "money-integer-cents" : i === 15 ? "use-pnpm" : i === 21 ? "grader-negative-test" : undefined,
  })),
  repeatMistakeRate: 0.08,
  acceptanceRate: 0.74,
  transfer: [
    { lesson: "use-logger", from: "alex", to: "riley", at: minutesAgo(26) },
    { lesson: "money-integer-cents", from: "jordan", to: "noor", at: daysAgo(2) },
    { lesson: "use-pnpm", from: "noor", to: "alex", at: daysAgo(1) },
  ],
  eval: {
    tasks: 12,
    runs: 3,
    off: { violationsPerTask: 0.83, passRate: 0.25 },
    on: { violationsPerTask: 0.17, passRate: 0.83 },
  },
};
