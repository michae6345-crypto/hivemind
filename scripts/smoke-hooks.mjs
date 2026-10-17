#!/usr/bin/env node
// Smoke test for the agent integration: SessionStart hook script, PostToolUse collisions, live feed, MCP tools.
// Usage: node scripts/smoke-hooks.mjs [baseUrl]   (default: $HIVEMIND_API_URL or http://localhost:3000)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trimStart().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = (process.argv[2] || process.env.HIVEMIND_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const TOKEN = process.env.HIVEMIND_TOKEN ?? "";
const stamp = Date.now();
const repoDir = join(root, "demo", "export-service");
let failed = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
};

// 1. SessionStart command hook
const ss = spawnSync(process.execPath, [join(root, "hooks", "session-start.mjs")], {
  input: JSON.stringify({ session_id: `smoke-ss-${stamp}`, cwd: repoDir, source: "startup", hook_event_name: "SessionStart" }),
  env: { ...process.env, HIVEMIND_API_URL: BASE, HIVEMIND_USER: "noor" },
  encoding: "utf8",
});
let ctx = "";
try {
  ctx = JSON.parse(ss.stdout).hookSpecificOutput.additionalContext;
} catch {}
check(ss.status === 0, "session-start exits 0");
check(/🔒/.test(ctx) && /lab customers/i.test(ctx), "pack has the 🔒 lab-isolation rule", `${ctx.length} chars`);
check(ctx.length <= 10000, "pack under the 10k additionalContext cap");

// 2. PostToolUse from two sessions on the same file → collision warning
const tool = (session, user) =>
  fetch(`${BASE}/api/hooks/tool`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-hm-user": user },
    body: JSON.stringify({
      hook_event_name: "PostToolUse",
      session_id: session,
      cwd: repoDir,
      tool_name: "Edit",
      tool_input: { file_path: join(repoDir, "src", "export.ts"), old_string: "a", new_string: "b" },
      tool_response: { success: true },
    }),
  }).then((r) => r.json());
const first = await tool(`smoke-a-${stamp}`, "adrian");
console.log("   first edit →", JSON.stringify(first).slice(0, 200));
const second = await tool(`smoke-b-${stamp}`, "michael");
const warn = second?.hookSpecificOutput?.additionalContext ?? "";
console.log("   second edit →", warn.replace(/\n/g, " | "));
check(/@adrian's agent edited export\.ts/.test(warn), "second session gets a collision warning");
const noop = await fetch(`${BASE}/api/hooks/tool`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-hm-user": "michael" },
  body: JSON.stringify({ session_id: "x", cwd: repoDir, tool_name: "Read", tool_input: { file_path: "a.ts" } }),
}).then((r) => r.json());
check(JSON.stringify(noop) === "{}", "non-edit tool returns {}");

// 3. Live feed
const live = await fetch(`${BASE}/api/activity/live`).then((r) => r.json());
check(live.items?.some((i) => i.sessionId === `smoke-b-${stamp}` && i.warning), "live items flag the collision");
check(live.feed?.some((f) => f.type === "collision"), "live feed has a collision event", `${live.feed?.length} feed items`);

// 4. MCP tools (JSON-RPC over Streamable HTTP)
const mcp = async (method, params, id) => {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
      "x-hm-user": "noor",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await r.text();
  const data = text.includes("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() : text;
  return { status: r.status, body: JSON.parse(data || "{}") };
};
const list = await mcp("tools/list", {}, 1);
const names = (list.body.result?.tools ?? []).map((t) => t.name);
check(names.includes("search_memory") && names.includes("propose_memory"), "MCP lists search_memory + propose_memory", names.join(","));
const search = await mcp("tools/call", { name: "search_memory", arguments: { query: "logger console" } }, 2);
const stext = search.body.result?.content?.[0]?.text ?? JSON.stringify(search.body);
check(/logger/i.test(stext), "search_memory finds the logger lesson");
if (process.argv.includes("--propose")) {
  const prop = await mcp(
    "tools/call",
    { name: "propose_memory", arguments: { title: `Smoke test lesson ${stamp}`, body: "Smoke test: ignore.", scope: "repo/export-service" } },
    3,
  );
  const ptext = prop.body.result?.content?.[0]?.text ?? JSON.stringify(prop.body);
  console.log("   propose →", ptext.slice(0, 200));
  check(/pending|blocked|merged/i.test(ptext), "propose_memory never creates an active memory");
}
const unauth = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check(unauth.status === 401, "MCP rejects missing bearer token", `HTTP ${unauth.status}`);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
