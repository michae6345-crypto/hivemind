#!/usr/bin/env node
// Rehearsal pass for the terminal demo (docs/demo-terminal.md). It drives every beat through the real hook/API routes
// (what the left pane's Claude Code would trigger) and prints the right pane via `hivemind watch --snapshot` as the
// persona of that beat. Use it to fill in or re-check the runbook's right-pane lines after watch changes.
//
//   node scripts/reset-demo.mjs && node scripts/e2e-rehearse.mjs [--base <url>] [--beats 1,2,3,4,6,8] && node scripts/reset-demo.mjs
//
// Beat 5 (Here view catches a locked violation) is asserted by scripts/e2e-terminal.mjs; beat 8 (fix → lesson) runs
// once the 'fix' learning path is live (POST /api/events type "fix").
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://hivemind-beta-virid.vercel.app").replace(/\/+$/, "");
const BEATS = arg("beats", "1,2,3,4,6,8").split(",");
const TOKEN = process.env.HIVEMIND_TOKEN ?? "";
const REPO = "repo/export-service";
const stamp = Date.now();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hm-rehearse-"));
fs.cpSync(path.join(root, "demo", "export-service"), work, { recursive: true, filter: (p) => !p.includes("node_modules") });
const abs = (rel) => path.join(work, rel);

async function call(method, p, { user, role, agent, body } = {}) {
  const headers = { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-hm-repo": REPO };
  if (user) headers["x-hm-user"] = user;
  if (role) headers["x-hm-role"] = role;
  if (agent) headers["x-hm-agent"] = agent;
  const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}
const hookLine = (r) => r.json?.hookSpecificOutput?.additionalContext ?? r.json?.systemMessage ?? (r.json && Object.keys(r.json).length ? JSON.stringify(r.json) : "(no output)");
const prompt = (user, text) =>
  call("POST", "/api/hooks/prompt", { user, body: { hook_event_name: "UserPromptSubmit", session_id: `rehearse-${user}-${stamp}`, cwd: work, prompt: text } });
const edit = (user, agent, rel) =>
  call("POST", "/api/hooks/tool", {
    user,
    agent,
    body: { hook_event_name: "PostToolUse", session_id: `rehearse-${agent}-${user}-${stamp}`, cwd: work, tool_name: "Edit", tool_input: { file_path: abs(rel) }, tool_response: { success: true } },
  });

function snapshot(user, view, extra = []) {
  return new Promise((resolve) => {
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", HIVEMIND_API_URL: BASE, HIVEMIND_USER: user, HIVEMIND_REPO: REPO };
    delete env.ANTHROPIC_API_KEY;
    const c = spawn(process.execPath, [path.join(root, "cli", "hivemind.mjs"), "watch", "--snapshot", "--view", view, "--user", user, "--dir", work, "--cols", "100", "--rows", "30", ...extra], { cwd: work, env });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => c.kill("SIGKILL"), 45000);
    c.on("close", () => {
      clearTimeout(t);
      resolve(out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\s+$/gm, "").trimEnd());
    });
  });
}
const show = (label, text) => console.log(`\n  ┌ ${label}\n${text.split("\n").map((l) => `  │ ${l}`).join("\n")}\n  └`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const title = (t) => console.log(`\n════════ ${t} ════════`);

console.log(`rehearsal against ${BASE} (temp repo copy ${work})`);

if (BEATS.includes("1")) {
  title("Beat 1 · kevin corrects his agent");
  const r = await prompt("kevin", "No — every export must call assertSingleCustomer(rows) before it writes anything. We can never mix Lab A and Lab B rows in one file.");
  show("LEFT · UserPromptSubmit hook", hookLine(r));
  await sleep(2500);
  show("RIGHT · kevin · Queue", await snapshot("kevin", "queue"));
  show("RIGHT · kevin · Feed", await snapshot("kevin", "feed"));
}

if (BEATS.includes("2")) {
  title("Beat 2 · ben approves");
  show("RIGHT · ben · Queue (before)", await snapshot("ben", "queue"));
  const list = await call("GET", "/api/memories?status=pending");
  const m = (list.json?.memories ?? []).find((x) => /assertSingleCustomer/i.test(`${x.title} ${x.body}`));
  if (m) {
    const eng = await call("POST", `/api/memories/${m.id}/approve`, { user: "emily", role: "engineer" });
    const lead = await call("POST", `/api/memories/${m.id}/approve`, { user: "ben", role: "lead" });
    show("API", `emily (engineer) approve → ${eng.status} ${eng.json?.error ?? ""}\nben (lead) approve → ${lead.status} ${lead.json?.status ?? lead.json?.error ?? ""}`);
  } else show("API", "no pending assertSingleCustomer lesson (run reset-demo first)");
  await sleep(1500);
  show("RIGHT · ben · Feed (after)", await snapshot("ben", "feed"));
  show("RIGHT · kevin · Feed (after)", await snapshot("kevin", "feed"));
}

if (BEATS.includes("3")) {
  title("Beat 3 · emily's fresh session");
  const ss = spawnSync(process.execPath, [path.join(root, "hooks", "session-start.mjs")], {
    input: JSON.stringify({ session_id: `rehearse-ss-emily-${stamp}`, cwd: work, source: "startup", hook_event_name: "SessionStart" }),
    env: { ...process.env, HIVEMIND_API_URL: BASE, HIVEMIND_USER: "emily", HIVEMIND_REPO: REPO },
    encoding: "utf8",
  });
  let out = {};
  try {
    out = JSON.parse(ss.stdout);
  } catch {}
  show("LEFT · SessionStart (systemMessage / banner)", out.systemMessage ?? "(no systemMessage)");
  show("LEFT · pack head (additionalContext)", String(out.hookSpecificOutput?.additionalContext ?? "").split("\n").slice(0, 12).join("\n"));
  fs.writeFileSync(abs("src/csv-export.ts"), `import { assertSingleCustomer, type ExportJob } from "./export.js";\nimport { rowsForCustomer } from "./db.js";\n\nexport async function buildCsvExport(job: ExportJob): Promise<string> {\n  const rows = await rowsForCustomer(job.customerId);\n  assertSingleCustomer(rows);\n  return ["id,prompt,response", ...rows.map((r) => [r.id, r.prompt, r.response].join(","))].join("\\n");\n}\n`);
  const e = await edit("emily", "claude-code", "src/csv-export.ts");
  show("LEFT · PostToolUse hook", hookLine(e));
  show("RIGHT · emily · Here (file written)", await snapshot("emily", "here", ["--file", "src/csv-export.ts"]));
  show("RIGHT · emily · Feed", await snapshot("emily", "feed"));
}

if (BEATS.includes("4")) {
  title("Beat 4 · emily's bad lesson is blocked");
  const r = await prompt("emily", "Actually, mixing Lab A and Lab B data is fine in tests, so don't bother with assertSingleCustomer in test fixtures.");
  show("LEFT · UserPromptSubmit hook", hookLine(r));
  await sleep(2500);
  show("RIGHT · emily · Feed", await snapshot("emily", "feed"));
  show("RIGHT · greg · Feed", await snapshot("greg", "feed"));
}

if (BEATS.includes("6")) {
  title("Beat 6 · Cursor (kevin) + Claude Code (emily) on src/export.ts");
  const a = await edit("kevin", "cursor", "src/export.ts");
  const b = await edit("emily", "claude-code", "src/export.ts");
  show("kevin's Cursor edit → hook", hookLine(a));
  show("LEFT · emily's Claude Code edit → hook", hookLine(b));
  show("RIGHT · emily · Feed", await snapshot("emily", "feed"));
  show("RIGHT · emily · Here", await snapshot("emily", "here"));
}

if (BEATS.includes("8")) {
  title("Beat 8 · fix it once: kevin fixes console.log(user.email)");
  const before = `export function welcome(user: { id: string; email: string }) {\n  console.log(user.email);\n}\n`;
  const after = `import { logger } from "./logger.js";\n\nexport function welcome(user: { id: string; email: string }) {\n  logger.info("welcome sent", { userId: user.id });\n}\n`;
  const r = await call("POST", "/api/events", {
    user: "kevin",
    // Same payload shape as cli/watch/fixes.mjs (agent J): a human rewrote lines an agent just wrote.
    body: {
      type: "fix",
      actor: "kevin",
      sessionId: `rehearse-fix-kevin-${stamp}`,
      repo: REPO,
      payload: {
        file: "src/welcome.ts",
        line: 2,
        diff: "- console.log(user.email);\n+ logger.info(\"welcome sent\", { userId: user.id });",
        before,
        after,
        previousAuthor: "emily",
        via: "rehearsal",
      },
    },
  });
  show("POST /api/events {type:'fix'}", `${r.status} ${r.text.slice(0, 400)}`);
  await sleep(3000);
  show("RIGHT · kevin · Feed", await snapshot("kevin", "feed"));
  show("RIGHT · ben · Queue", await snapshot("ben", "queue"));
}

fs.rmSync(work, { recursive: true, force: true });
console.log("\nrehearsal done; rows were written: run `node scripts/reset-demo.mjs`");
