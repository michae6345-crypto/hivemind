// Offline stand-in for the Hivemind API, for rendering CLI screenshots without touching prod (e.g. during a recording
// freeze). Canned Meridian Data team memory; the check endpoint runs a few deterministic detectors on the posted text.
//   import { startMock } from "./mock-api.mjs"; const { url, close } = await startMock();
//   node cli/scripts/mock-api.mjs [port]   (standalone)
import { createServer } from "node:http";

const H = 3600000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const people = [
  { id: "greg", name: "Greg", role: "security", scopeId: "org", title: "Head of Security" },
  { id: "ben", name: "Ben", role: "lead", scopeId: "team/data-pipelines", title: "Data Pipelines Lead" },
  { id: "kevin", name: "Kevin", role: "engineer", scopeId: "team/data-pipelines", title: "Engineer, Data Pipelines" },
  { id: "emily", name: "Emily", role: "engineer", scopeId: "team/data-pipelines", title: "Engineer, Data Pipelines" },
];
const scopes = [
  { id: "org", level: "org", name: "Meridian Data", parentId: null, owner: "greg" },
  { id: "team/data-pipelines", level: "team", name: "data-pipelines", parentId: "org", owner: "ben" },
  { id: "repo/playground", level: "repo", name: "playground", parentId: "team/data-pipelines", owner: "ben" },
  { id: "repo/export-service", level: "repo", name: "export-service", parentId: "team/data-pipelines", owner: "ben" },
];
const mem = (o) => ({ kind: "lesson", locked: false, status: "active", source: "correction", alpha: 6, beta: 1, evidence: [], createdAt: ago(240 * H), updatedAt: ago(4 * H), ...o });
const memories = [
  mem({ id: "m-lab", slug: "sec-lab-isolation", scopeId: "org", kind: "directive", locked: true, source: "human", author: "greg", alpha: 30, title: "Never mix data from different lab customers", body: "Never combine Lab A and Lab B data in one export, dataset, eval set or pipeline run.", evidence: [{ at: ago(960 * H), type: "manual", actor: "greg", ref: "Security policy v3", quote: "Customer isolation is a contract term with every lab. No exceptions, including test data." }, { at: ago(20 * H), type: "fix", actor: "agent:cli", quote: "- const rows = [...labA, ...labB]" }] }),
  mem({ id: "m-pii", slug: "sec-no-pii-logs", scopeId: "org", kind: "directive", locked: true, source: "human", author: "greg", alpha: 24, title: "Never log expert personal info", body: "Expert names, emails and payout details never go to logs.", evidence: [{ at: ago(744 * H), type: "manual", actor: "greg", ref: "Incident INC-27", quote: "A stack trace with an expert's email reached our error tracker. Never again." }] }),
  mem({ id: "m-tenant", slug: "playground-for-tenant", scopeId: "repo/playground", source: "review", author: "ben", alpha: 7, title: "Tenant tables are only read through forTenant(tenantId)", body: "Any query touching tasks, exports or payouts goes through db.forTenant(tenantId).", evidence: [{ at: ago(144 * H), type: "review_comment", actor: "ben", ref: "meridian/playground#14", quote: "listExports() selects from exports with no tenant_id — that's exactly INC-2291. forTenant()." }, { at: ago(48 * H), type: "correction", actor: "kevin", ref: "session s-121", quote: "no, don't query exports directly, go through db.forTenant" }] }),
  mem({ id: "m-log", slug: "use-logger", scopeId: "org", author: "kevin", alpha: 9, title: "Use logger, not console.log", body: "Use the shared logger (structured, PII-scrubbed).", evidence: [{ at: ago(220 * H), type: "correction", actor: "kevin", ref: "session s-048", quote: "use the logger, console.log skips the PII scrubber" }] }),
  mem({ id: "m-cents", slug: "money-integer-cents", scopeId: "org", source: "review", author: "ben", alpha: 11, title: "Money and payouts are integer cents", body: "Store and compute every payout as integer cents.", evidence: [{ at: ago(400 * H), type: "review_comment", actor: "ben", ref: "meridian/export-service#88", quote: "amount_cents everywhere; dollars only in the UI." }] }),
  mem({ id: "m-p1", slug: "retry-jitter", scopeId: "repo/playground", status: "pending", author: "emily", title: "Labeler client retries 429/503 with full jitter", body: "…" }),
  mem({ id: "m-p2", slug: "presign-900", scopeId: "repo/playground", status: "pending", author: "kevin", title: "presignExport() caps expiresIn at 900 seconds", body: "…" }),
  mem({ id: "m-b1", slug: "mixing-fine-tests", scopeId: "repo/playground", status: "blocked", author: "emily", updatedAt: ago(0.2 * H), title: "Mixing labs is fine for test fixtures", body: "…", blockedReason: 'Contradicts @greg\'s locked rule "Never mix data from different lab customers".' }),
];
const activeRules = memories.filter((m) => m.status === "active");

const PACK = `# Hivemind · Team rules for #repo/playground

## Locked rules (always apply)

LOCKED RULE · #org
Never mix data from different lab customers
Set by @greg · Head of Security · locked 7 Sep
Never combine Lab A and Lab B data in one export, dataset, eval set or pipeline run.

LOCKED RULE · #org
Never log expert personal info
Set by @greg · Head of Security · locked 16 Sep
Expert names, emails and payout details never go to logs. Log hmacExpertId(id) instead.

## Team lessons

TEAM LESSON · #repo/playground
Tenant tables are only read through forTenant(tenantId)
Learned from @ben's review · 6d ago · approved by @ben
Any query touching tasks, exports or payouts goes through db.forTenant(tenantId).

TEAM LESSON · #org
Money and payouts are integer cents
Learned from @ben's review · 17d ago
Store and compute every payout as integer cents (amount_cents).

Hivemind · More team memory: call get_team_rules / search_memory before guessing a convention.`;

const vsRule = (m) => ({ id: m.id, slug: m.slug, title: m.title, summary: m.body, scopeId: m.scopeId, kind: m.kind, locked: m.locked, status: m.status, owner: `@${m.author}`, handle: `@${m.author}`, ownerId: m.author, ownerFirst: m.author, ownerRole: people.find((p) => p.id === m.author)?.title ?? "", taughtAt: m.createdAt, learnedFrom: null, learnedVia: null, evidenceCount: m.evidence.length, confidence: 0.9, mentionsFile: false, symbols: m.slug === "use-logger" ? ["console.log", "logger"] : [] });

/** Deterministic findings for the posted file (same shape as /api/vscode/check). */
function check(text) {
  const out = [];
  const v = (m, line, s, e, message, fix) => out.push({ ruleId: m.id, ruleSlug: m.slug, ruleTitle: m.title, locked: m.locked, owner: `@${m.author}`, startLine: line, endLine: line, startCol: s, endCol: e, message, severity: m.locked ? "error" : "warning", source: "regex", ...(fix ? { fix } : {}) });
  const by = (slug) => memories.find((m) => m.slug === slug);
  text.split("\n").forEach((l, i) => {
    let k;
    if ((k = l.indexOf("[...labA, ...labB]")) >= 0) v(by("sec-lab-isolation"), i, k, k + 18, "Breaks a locked rule. Combines two lab customers' rows in one export.");
    if ((k = l.indexOf("console.log(")) >= 0) v(by("use-logger"), i, k, l.lastIndexOf(")") + 1, "Doesn't follow a team lesson.", { title: "Fix: use logger.info instead of console.log", kind: "replaceLines", line: i, endLine: i, text: l.replace("console.log(", "logger.info(") });
    if ((k = l.search(/\w+\.email\b/)) >= 0) v(by("sec-no-pii-logs"), i, k, k + l.slice(k).match(/\w+\.email/)[0].length, "Breaks a locked rule. Logs an expert's email.", { title: "Fix: log the expert id instead", kind: "replaceLines", line: i, endLine: i, text: l.replace(/(\w+)\.email\b/, "$1.id") });
    if ((k = l.indexOf("/ 100")) >= 0) v(by("money-integer-cents"), i, k - 14, k + 5, "Doesn't follow a team lesson. Converts integer cents to float dollars.");
  });
  return out;
}

function route(req, body) {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  const q = (k) => u.searchParams.get(k) ?? "";
  if (p === "/api/scopes") return { scopes, people };
  if (p === "/api/context-pack") return { markdown: PACK, memoryIds: activeRules.map((m) => m.id), tokens: Math.ceil(PACK.length / 4), repo: q("repo") || "repo/playground", rules: activeRules.length, locked: 2 };
  if (p === "/api/memories") {
    const st = q("status").split(",").filter(Boolean);
    const term = q("q").toLowerCase();
    return { memories: memories.filter((m) => (!st.length || st.includes(m.status)) && (!term || m.slug === term || `${m.title} ${m.body} ${m.slug}`.toLowerCase().includes(term))) };
  }
  if (p === "/api/activity/live") return { items: [{ id: "1", sessionId: "s", actor: "emily", repo: "playground", file: "src/jobs.ts", createdAt: ago(0.1 * H), agent: "claude-code" }], feed: [{ id: "f1", type: "blocked", actor: "emily", text: "proposed a lesson, blocked by a locked rule", at: ago(0.2 * H), memoryId: "m-b1" }] };
  if (p === "/api/vscode/rules") return { repo: q("repo"), org: "Meridian Data", file: q("file"), rules: activeRules.map(vsRule), pending: { count: 2, items: [] }, approver: { id: "ben", name: "Ben" } };
  if (p === "/api/vscode/check") return { violations: check(JSON.parse(body || "{}").text ?? ""), cached: false, ms: 42 };
  if (p === "/api/mcp") {
    const file = JSON.parse(body || "{}")?.params?.arguments?.file;
    const head = file ? `## Rules for \`${file}\`\n- **Money and payouts are integer cents** (#org)\n- **Tenant tables are only read through forTenant(tenantId)** (#repo/playground)\n\n` : "";
    return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: head + PACK }] } };
  }
  return null;
}

export function startMock(port = 0) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        const data = route(req, body);
        res.writeHead(data ? 200 : 404, { "content-type": "application/json" });
        res.end(JSON.stringify(data ?? { error: "not in the mock" }));
      });
    });
    server.listen(port, "127.0.0.1", () => resolve({ url: `http://localhost:${server.address().port}`, close: () => server.close() }));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const { url } = await startMock(Number(process.argv[2]) || 0);
  console.log(`mock Hivemind API on ${url}`);
}
