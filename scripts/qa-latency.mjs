#!/usr/bin/env node
// QA2 latency probe against prod (or --base <url>). Read-mostly: the prompt probe sends a non-correction prompt (the
// engine deletes that event), the tool probe records activity in repo/qa-probe (reset-demo deletes it).
//
//   node scripts/qa-latency.mjs [--base https://…] [--n 5] [--only pack,prompt,tool,live,rules,check,statusline,open,hook]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://hivemind-q17i.onrender.com").replace(/\/+$/, "");
const N = Number(arg("n", 5));
const ONLY = arg("only", "pack,hook,prompt,tool,live,memories,rules,check,statusline,open").split(",");
const TOKEN = process.env.HIVEMIND_TOKEN ?? "";
const H = (user = "kevin", repo = "repo/playground") => ({
  authorization: `Bearer ${TOKEN}`,
  "x-hm-user": user,
  "x-hm-repo": repo,
  "content-type": "application/json",
});

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { first: Math.round(xs[0]), p50: Math.round(p(0.5)), max: Math.round(s[s.length - 1]), n: xs.length };
};
const rows = [];
async function time(label, fn) {
  const xs = [];
  let note = "";
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    try {
      note = (await fn(i)) ?? note;
    } catch (e) {
      note = `ERR ${e.message}`;
    }
    xs.push(performance.now() - t);
  }
  const r = { label, ...stats(xs), note: String(note).slice(0, 70) };
  rows.push(r);
  console.log(`${label.padEnd(34)} first ${String(r.first).padStart(5)}  p50 ${String(r.p50).padStart(5)}  max ${String(r.max).padStart(5)}  ${r.note}`);
}
async function req(method, p, body, h = H()) {
  const res = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 60)}`);
  return text;
}
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: "utf8", timeout: 30000, ...opts });

if (ONLY.includes("pack"))
  await time("GET /api/context-pack", async (i) => {
    const t = await req("GET", `/api/context-pack?repo=repo/playground&user=kevin&session=preview-qa2-${i}&log=0`);
    return `rules=${JSON.parse(t).rules}`;
  });
if (ONLY.includes("hook"))
  await time("SessionStart hook (node, total)", () => {
    const r = node([path.join(root, "hooks/session-start.mjs")], {
      input: JSON.stringify({ session_id: `preview-qa2-${Date.now()}`, cwd: path.join(root, "playground") }),
      env: { ...process.env, HIVEMIND_USER: "kevin" },
    });
    return JSON.parse(r.stdout).systemMessage ?? r.stdout.slice(0, 60);
  });
if (ONLY.includes("prompt"))
  await time("POST /api/hooks/prompt (non-corr)", async (i) => {
    const t = await req("POST", "/api/hooks/prompt", {
      prompt: `Add a helper formatCents${i}(n: number) to src/money.ts that returns a dollar string.`,
      session_id: `preview-qa2-prompt-${i}`,
      cwd: path.join(root, "playground"),
    });
    return t.slice(0, 60);
  });
if (ONLY.includes("tool"))
  await time("POST /api/hooks/tool", async (i) => {
    const cwd = path.join(root, "playground");
    const t = await req(
      "POST",
      "/api/hooks/tool",
      { tool_name: "Write", tool_input: { file_path: path.join(cwd, "src", "experts.ts") }, session_id: `preview-qa2-tool-${i}`, cwd },
      H("qa2", "repo/qa-probe"),
    );
    return t.slice(0, 60);
  });
if (ONLY.includes("live")) await time("GET /api/activity/live", () => req("GET", "/api/activity/live?repo=repo/playground").then((t) => `${t.length}B`));
if (ONLY.includes("memories"))
  await time("GET /api/memories?chain=1", () => req("GET", "/api/memories?scope=repo/playground&chain=1").then((t) => `${t.length}B`));
if (ONLY.includes("rules")) await time("GET /api/vscode/rules", () => req("GET", "/api/vscode/rules?repo=repo/playground").then((t) => `${t.length}B`));
if (ONLY.includes("check"))
  for (const fast of [false, true])
    await time(`POST /api/vscode/check${fast ? " fast" : ""} (new text)`, () =>
      req("POST", "/api/vscode/check", { repo: "repo/playground", file: "src/experts.ts", text: `logger.info("sent", { email: expert.email }); // ${Math.random()}\n`, fast }).then(
        (t) => `${(JSON.parse(t).violations ?? []).length} violations`,
      ),
    );
if (ONLY.includes("statusline"))
  await time("hivemind statusline", () => {
    const r = node([path.join(root, "cli/hivemind.mjs"), "statusline"], {
      cwd: path.join(root, "playground"),
      input: JSON.stringify({ session_id: "qa2", cwd: path.join(root, "playground"), workspace: { current_dir: path.join(root, "playground") } }),
      env: { ...process.env, HIVEMIND_USER: "kevin" },
    });
    return r.stdout.replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 60);
  });
if (ONLY.includes("open"))
  await time("hivemind open --dry-run", () => {
    const r = node([path.join(root, "cli/hivemind.mjs"), "open", "--dry-run"], { cwd: path.join(root, "playground"), env: { ...process.env, HIVEMIND_USER: "kevin" } });
    return (r.stdout + r.stderr).trim().split("\n").pop().slice(0, 60);
  });

if (process.argv.includes("--md")) {
  console.log("\n| Probe | first | p50 | max | n |\n|---|---|---|---|---|");
  for (const r of rows) console.log(`| ${r.label} | ${r.first} | ${r.p50} | ${r.max} | ${r.n} |`);
}
