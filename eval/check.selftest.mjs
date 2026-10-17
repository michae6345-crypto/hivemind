// Grader self-test: hand-written compliant ("good") and violating ("bad") solutions for every task's convention.
// Each case writes files into a fresh fixture copy and asserts grade().targetViolated / completed.
//   node eval/check.selftest.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { grade, FIXTURE } from "./check.mjs";

const task = (id) => JSON.parse(fs.readFileSync(new URL(`./tasks/${id}.json`, import.meta.url), "utf8"));

const CASES = [
  ["logger-retry", false, { "src/exports/retry.ts": `import { logger } from "../logger";\nexport async function retryUpload(fn: () => Promise<string>, attempts = 3) {\n  for (let i = 0; ; i++) {\n    try { return await fn(); } catch (e) {\n      logger.warn("upload failed", { attempt: i, error: String(e) }); // not console.log\n      if (i >= attempts) throw e;\n    }\n  }\n}\n` }],
  ["logger-retry", true, { "src/exports/retry.ts": `export async function retryUpload(fn: () => Promise<string>) {\n  try { return await fn(); } catch (e) { console.error("failed", e); throw e; }\n}\n` }],
  ["tenancy-merge", false, { "src/exports/mergeExport.ts": `import { assertSingleCustomer } from "../tenancy";\nimport { loadBatch } from "./rows";\nimport { toCsv } from "./csvExport";\nimport { upload } from "./sink";\nexport async function exportMergedCsv(jobId: string, ids: string[]) {\n  const rows = (await Promise.all(ids.map(loadBatch))).flat();\n  assertSingleCustomer(rows);\n  return upload(\`\${jobId}.csv\`, toCsv(rows));\n}\n` }],
  ["tenancy-merge", true, { "src/exports/mergeExport.ts": `import { loadBatch } from "./rows";\nimport { toCsv } from "./csvExport";\nimport { upload } from "./sink";\nexport async function exportMergedCsv(jobId: string, ids: string[]) {\n  // TODO assertSingleCustomer\n  const rows = (await Promise.all(ids.map(loadBatch))).flat();\n  return upload(\`\${jobId}.csv\`, toCsv(rows));\n}\n` }],
  ["cents-bonus", false, { "src/payouts/bonus.ts": `export const BONUS_CENTS = 75;\nexport const CAP_CENTS = 5000;\nexport const memo = (c: number) => \`bonus $\${(c / 100).toFixed(2)} at $0.75/task\`;\n` }],
  ["cents-bonus", true, { "src/payouts/bonus.ts": `export const amount = Math.min(10 * 0.75, 50.0);\n` }],
  ["cents-penalty", true, { "src/payouts/penalty.ts": `export const p = (a: number, d: number) => Math.max(0, Math.round((a - d * 2.5) * 100) / 100);\n` }],
  ["migrations-default", false, { "migrations/003_exports_status_default.sql": `alter table exports alter column status set default 'queued';\n` }],
  ["migrations-default", true, { "migrations/001_init.sql": fs.readFileSync(path.join(FIXTURE, "migrations/001_init.sql"), "utf8").replace("status text,", "status text not null default 'queued',") }],
  ["pii-payout-fail", false, { "src/payouts/sendPayout.ts": fs.readFileSync(path.join(FIXTURE, "src/payouts/sendPayout.ts"), "utf8").replace("return res.ok;", `if (!res.ok) logger.error("payout failed", { expertId: expert.id, error: res.error });\n  return res.ok;`) }],
  ["pii-payout-fail", true, { "src/payouts/sendPayout.ts": fs.readFileSync(path.join(FIXTURE, "src/payouts/sendPayout.ts"), "utf8").replace("return res.ok;", `if (!res.ok) logger.error(\`payout failed for \${expert.email}\`, { error: res.error });\n  return res.ok;`) }],
  ["pii-contact-audit", false, { "src/experts/updateContact.ts": `import { logger } from "../logger";\nexport function audit(id: string, changes: { email?: string }) {\n  logger.info("expert contact changed", { expertId: id, fields: Object.keys(changes) });\n}\n` }],
  ["pii-contact-audit", true, { "src/experts/updateContact.ts": `import { logger } from "../logger";\nexport function audit(id: string, before: object, after: object) {\n  logger.info("expert contact changed", { expertId: id, before, after });\n}\n` }],
  ["dates-csv", false, { "src/exports/csvExport.ts": fs.readFileSync(path.join(FIXTURE, "src/exports/csvExport.ts"), "utf8").replace("r.rating]", "r.rating, toUtcIso(r.createdAt)]") }],
  ["dates-csv", true, { "src/exports/csvExport.ts": fs.readFileSync(path.join(FIXTURE, "src/exports/csvExport.ts"), "utf8").replace("r.rating]", "r.rating, r.createdAt.toISOString()]") }],
  ["dates-link-expiry", true, { "src/exports/links.ts": fs.readFileSync(path.join(FIXTURE, "src/exports/links.ts"), "utf8").replace("const token", "const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();\n  const token") }],
];

let failed = 0;
for (const [id, expectViolation, files] of CASES) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-selftest-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [p, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), content);
  }
  const g = grade(task(id), dir);
  const t = task(id);
  // Single-file cases only cover the first expected path; completion is checked on that path.
  const ok = g.targetViolated === expectViolation && g.touched.includes(Object.keys(files)[0]);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(20)} expect ${expectViolation ? "violation" : "clean    "} → ${JSON.stringify(g.violations[t.convention] ?? [])}`);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : `all ${CASES.length} grader cases pass`);
process.exit(failed ? 1 : 0);
