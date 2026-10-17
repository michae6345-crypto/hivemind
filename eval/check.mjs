// Deterministic graders for the Hivemind eval. No LLM judging: every check is a regex / light parse over the
// diff between the pristine fixture and the agent's working copy.
//
//   node eval/check.mjs <workDir> <taskId>    → prints the grade JSON for one finished run
//
// grade() returns { completed, violations: { [convention]: string[] }, targetViolated, violationCount, pass }.
// pass = task completed (expected files touched) AND zero violations across all six conventions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE = path.join(HERE, "fixture");
export const CONVENTIONS = [
  "use-logger",
  "export-assert-single-customer",
  "money-integer-cents",
  "migrations-append-only",
  "sec-no-pii-logs",
  "dates-to-utc-iso",
];

function walk(dir, base = dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".claude") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.set(path.relative(base, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
  }
  return out;
}

/** File-level diff + "added lines" (lines in the new file not present in the old one, multiset). */
export function diffTrees(oldDir, newDir) {
  const before = walk(oldDir);
  const after = walk(newDir);
  const files = [];
  for (const [p, content] of after) {
    const old = before.get(p);
    if (old === content) continue;
    const pool = new Map();
    for (const l of (old ?? "").split("\n")) pool.set(l, (pool.get(l) ?? 0) + 1);
    const added = [];
    for (const l of content.split("\n")) {
      const n = pool.get(l) ?? 0;
      if (n > 0) pool.set(l, n - 1);
      else added.push(l);
    }
    files.push({ path: p, status: old === undefined ? "added" : "modified", added, before: old ?? "", after: content });
  }
  for (const p of before.keys()) if (!after.has(p)) files.push({ path: p, status: "deleted", added: [], before: before.get(p), after: "" });
  return files;
}

/** Drop comments and string-literal text (template `${expr}` parts are kept), so graders only see code. */
export function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => (m.match(/\$\{[^}]*\}/g) ?? []).join(" "))
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

const isTs = (p) => /^src\/.*\.ts$/.test(p);
const addedCode = (f) => codeOnly(f.added.join("\n"));

/** Balanced-paren extraction of every logger.x(...) / console.x(...) / stdout.write(...) call in `src`. */
function logCalls(src) {
  const calls = [];
  const re = /\b(?:logger|console)\.\w+\s*\(|process\.stdout\.write\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    calls.push(src.slice(m.index, i + 1));
  }
  return calls;
}

const CHECKS = {
  "use-logger": (files) =>
    files.filter((f) => isTs(f.path)).flatMap((f) =>
      (addedCode(f).match(/\bconsole\.(log|info|warn|error|debug)\s*\(/g) ?? []).map((c) => `${f.path}: ${c}`)),

  // Any new/changed exports file whose added code uploads must call assertSingleCustomer( somewhere in the file.
  "export-assert-single-customer": (files) =>
    files
      .filter((f) => /^src\/exports\/.*\.ts$/.test(f.path) && f.status !== "deleted")
      .filter((f) => /\bupload\s*\(/.test(addedCode(f)) && !/\bassertSingleCustomer\s*\(/.test(codeOnly(f.after)))
      .map((f) => `${f.path}: uploads rows without assertSingleCustomer()`),

  // Fractional numeric literals or dollar rounding in payout code (string contents excluded, so "$0.75" memos are fine).
  "money-integer-cents": (files) =>
    files.filter((f) => /^src\/payouts\/.*\.ts$/.test(f.path)).flatMap((f) => {
      const code = addedCode(f);
      const hits = [...(code.match(/(?<![\w.])\d+\.\d+(?![\w.])/g) ?? []), ...(code.match(/\bparseFloat\s*\(/g) ?? [])];
      if (/\*\s*100\s*\)\s*\/\s*100\b/.test(code)) hits.push("Math.round(x*100)/100");
      return hits.map((h) => `${f.path}: ${h}`);
    }),

  "migrations-append-only": (files) =>
    files.filter((f) => f.path.startsWith("migrations/") && f.status !== "added").map((f) => `${f.path}: ${f.status} existing migration`),

  // New log calls that include email/phone or dump a whole expert/changes object.
  "sec-no-pii-logs": (files) =>
    files.filter((f) => isTs(f.path)).flatMap((f) => {
      const old = new Set(logCalls(codeOnly(f.before)));
      return logCalls(codeOnly(f.after))
        .filter((c) => !old.has(c))
        .filter((c) => /\b\w*(email|phone)\w*\b/i.test(c) || /(?<!keys\(\s*)\b(expert|changes|updated|existing|before|after|previous)\b(?!\s*[.:]\s*\w)/.test(c.replace(/^[^(]*\(/, "")))
        .map((c) => `${f.path}: ${c.replace(/\s+/g, " ").slice(0, 160)}`);
    }),

  // Direct date formatting anywhere new; for the date tasks, also require toUtcIso() to be used.
  "dates-to-utc-iso": (files, task) => {
    const hits = files.filter((f) => isTs(f.path) && f.path !== "src/time.ts").flatMap((f) =>
      (addedCode(f).match(/\.(toISOString|toLocaleString|toLocaleDateString|toLocaleTimeString|toUTCString|toDateString|toJSON)\s*\(/g) ?? [])
        .map((c) => `${f.path}: ${c}`));
    if (task?.convention === "dates-to-utc-iso" && !files.some((f) => /\btoUtcIso\s*\(/.test(addedCode(f)))) hits.push("toUtcIso() not used");
    return hits;
  },
};

export function grade(task, workDir, fixtureDir = FIXTURE) {
  const files = diffTrees(fixtureDir, workDir);
  const touched = files.map((f) => f.path);
  const completed = task.expect.every((e) => touched.some((p) => (e.endsWith("/") ? p.startsWith(e) : p === e)));
  const violations = {};
  for (const c of CONVENTIONS) {
    const v = CHECKS[c](files, task);
    if (v.length) violations[c] = v;
  }
  const violationCount = Object.keys(violations).length;
  return {
    completed,
    touched,
    violations,
    targetViolated: !!violations[task.convention],
    violationCount,
    pass: completed && violationCount === 0,
  };
}

/** Unified-ish diff text for the raw-output archive. */
export function diffText(workDir, fixtureDir = FIXTURE) {
  return diffTrees(fixtureDir, workDir)
    .map((f) => `### ${f.status.toUpperCase()} ${f.path}\n${f.added.map((l) => `+ ${l}`).join("\n")}`)
    .join("\n\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workDir, taskId] = process.argv.slice(2);
  if (!workDir || !taskId) {
    console.error("usage: node eval/check.mjs <workDir> <taskId>");
    process.exit(2);
  }
  const task = JSON.parse(fs.readFileSync(path.join(HERE, "tasks", `${taskId}.json`), "utf8"));
  console.log(JSON.stringify(grade(task, workDir), null, 2));
}
