#!/usr/bin/env node
// Terminal demo rehearsal: `hivemind watch` (right pane) must show a 🔒 violation after a file write (left pane).
//
//   node scripts/e2e-terminal.mjs                                   # against production
//   node scripts/e2e-terminal.mjs --base http://localhost:3104 --user emily
//
// Steps (temp copy of demo/export-service, so the real demo repo is never touched):
//   1. watch --help prints watch usage
//   2. watch --snapshot --view here BEFORE the write: no PII violation listed
//   3. write src/payout-report.ts that logs an expert's email
//   4. hivemind check src/payout-report.ts → "locked rule: Never log expert personal info", exit 1 (same API as watch)
//   5. watch --snapshot --view here AFTER the write: the locked rule + owner are listed
// Steps 2 and 5 SKIP (not FAIL) until `watch --snapshot` is on main. Exit 1 only on a FAIL.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = arg("base", "https://hivemind-beta-virid.vercel.app").replace(/\/+$/, "");
const USER = arg("user", "emily");
const CLI = path.join(root, "cli", "hivemind.mjs");
const RULE = /Never log expert personal info/;

const results = [];
const report = (step, status, title, evidence = []) => {
  results.push({ step, status, title });
  console.log(`\n${status.padEnd(4)}  (${step}) ${title}`);
  for (const l of [].concat(evidence).filter(Boolean)) console.log(`      ${l}`);
};
const short = (s, n = 240) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function cli(args, cwd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", HIVEMIND_API_URL: BASE, HIVEMIND_USER: USER, HIVEMIND_REPO: "repo/export-service" };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") }); // strip any ANSI that slips through
    });
  });
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "hm-e2e-terminal-"));
fs.cpSync(path.join(root, "demo", "export-service"), work, { recursive: true, filter: (p) => !p.includes("node_modules") });
const target = path.join(work, "src", "payout-report.ts");
console.log(`e2e-terminal against ${BASE} as @${USER} in ${work}`);

// 1. watch --help
const help = await cli(["watch", "--help"], work);
const watchUsage = /watch/i.test(help.out) && !/hivemind init\s+\[--agents/.test(help.out);
const snapshotFlag = /--snapshot/.test(help.out) ? "--snapshot" : /--once/.test(help.out) ? "--once" : null;
report("1", watchUsage ? "PASS" : "FAIL", "hivemind watch --help prints watch usage", [
  watchUsage ? short(help.out, 200) : "falls through to the global usage (watch not on main yet)",
  `non-interactive render flag: ${snapshotFlag ?? "none yet (asked K for --snapshot)"}`,
]);

const snapshot = () => cli(["watch", snapshotFlag, "--view", "here", "--dir", work, "--file", "src/payout-report.ts"], work, 45000);

// 2. Here view before the write
if (snapshotFlag) {
  fs.writeFileSync(target, `import { logger } from "./logger.js";\n\nexport function reportPayout(expertId: string, cents: number) {\n  logger.info("payout sent", { expertId, cents });\n}\n`);
  const before = await snapshot();
  report("2", !RULE.test(before.out) && before.code === 0 ? "PASS" : "FAIL", "Here view before the bad write: no PII violation", [`exit ${before.code}`, short(before.out)]);
} else report("2", "SKIP", "Here view before the bad write", "watch has no snapshot mode yet");

// 3. the bad write (what Claude would do in the left pane)
fs.writeFileSync(
  target,
  `import { logger } from "./logger.js";\n\ntype Expert = { id: string; email: string; phone: string };\n\nexport function reportPayout(expert: Expert, cents: number) {\n  logger.info("payout sent", { email: expert.email, cents });\n}\n`,
);

// 4. hivemind check: same detectors watch renders
const check = await cli(["check", "src/payout-report.ts"], work);
report("4", check.code === 1 && RULE.test(check.out) && /locked rule/i.test(check.out) ? "PASS" : "FAIL", "hivemind check flags the locked PII rule (exit 1)", [
  `exit ${check.code}`,
  short(check.out.split("\n").filter((l) => /locked rule|owner|~~~|fix/.test(l)).join(" ⏎ "), 300),
]);

// 5. Here view after the write
if (snapshotFlag) {
  const after = await snapshot();
  const ok = RULE.test(after.out) && /locked/i.test(after.out);
  report("5", ok ? "PASS" : "FAIL", "Here view after the write shows the locked violation", [`exit ${after.code}`, short(after.out, 400)]);
} else report("5", "SKIP", "Here view after the write shows the locked violation", "watch has no snapshot mode yet");

fs.rmSync(work, { recursive: true, force: true });
console.log("\n──────── summary ────────");
for (const r of results) console.log(`${r.status.padEnd(4)}  (${r.step}) ${r.title}`);
process.exit(results.some((r) => r.status === "FAIL" && r.step !== "1") ? 1 : 0);
