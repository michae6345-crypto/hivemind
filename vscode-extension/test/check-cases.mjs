// Regression check for POST /api/vscode/check's deterministic fast path: each demo violation must be caught,
// on the exact expression, in under 1.5s. Usage: node test/check-cases.mjs [apiUrl]  (token from ../.env.local)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const api = process.argv[2] || "http://localhost:3107";
const token = readFileSync(join(root, ".env.local"), "utf8").match(/^HIVEMIND_TOKEN=(.*)$/m)?.[1]?.trim() ?? "";
const base = readFileSync(join(root, "demo", "export-service", "src", "export.ts"), "utf8").replace(/\r\n/g, "\n");

const cases = [
  {
    name: "clean demo file",
    code: "",
    expect: [],
  },
  {
    name: "mixing Lab A/B rows",
    code: `
export async function exportBoth(job: ExportJob): Promise<string> {
  const labARows = await rowsForCustomer("lab-a");
  const labBRows = await rowsForCustomer("lab-b");
  const all = [...labARows, ...labBRows];
  return all.map((r) => JSON.stringify(r)).join("\\n");
}`,
    expect: [{ slug: "sec-lab-isolation", text: "[...labARows, ...labBRows]" }],
  },
  {
    name: "console.log",
    code: `
export function debugJob(job: ExportJob) {
  console.log("job", job.jobId);
}`,
    expect: [{ slug: "use-logger", text: 'console.log("job", job.jobId)' }],
  },
  {
    name: "logging an expert's email",
    code: `
export function notifyExpert(expert: { id: string; email: string }) {
  logger.info("notified expert", { email: expert.email });
}`,
    expect: [{ slug: "sec-no-pii-logs", text: "expert.email" }],
  },
  {
    name: "float money",
    code: `
export function payoutDollars(rows: Row[]): number {
  return rows.reduce((sum, r) => sum + r.payout_cents / 100, 0);
}`,
    expect: [{ slug: "money-integer-cents", text: "r.payout_cents / 100" }],
  },
  {
    name: "export without assertSingleCustomer",
    code: `
export async function writeExport(rows: Row[]) {
  return rows.length;
}`,
    expect: [{ slug: "sec-lab-isolation", text: "writeExport(rows: Row[])" }],
  },
];

let failed = 0;
for (const c of cases) {
  const text = base + c.code + "\n";
  const lines = text.split("\n");
  const t0 = Date.now();
  const res = await fetch(`${api}/api/vscode/check`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-hm-agent": "vscode", "x-hm-user": "alex" },
    body: JSON.stringify({ repo: "repo/export-service", file: "src/export.ts", text }),
  });
  const ms = Date.now() - t0;
  const body = await res.json();
  const got = (body.violations ?? []).map((v) => ({
    slug: v.ruleSlug,
    source: v.source,
    text: v.startCol != null ? lines[v.startLine].slice(v.startCol, v.endCol) : lines[v.startLine].trim(),
    message: v.message,
    fix: v.fix?.title,
  }));
  const regexHits = got.filter((g) => g.source === "regex");
  const ok =
    ms < 1500 &&
    c.expect.every((e) => regexHits.some((g) => g.slug === e.slug && g.text === e.text)) &&
    (c.expect.length > 0 || regexHits.length === 0);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  ${res.status} ${ms}ms (server ${body.ms}ms${body.pending ? ", llm pending" : ""}${body.cached ? ", cached" : ""})`);
  for (const g of got) console.log(`      ${g.source} ${g.slug} [${g.text}] ${g.fix ?? ""}\n        ${g.message}`);
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
