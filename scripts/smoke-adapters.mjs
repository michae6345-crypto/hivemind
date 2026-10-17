#!/usr/bin/env node
// Smoke test for the cross-vendor hook adapters (hooks/adapters/*.mjs) against a running Hivemind server.
// Usage: node scripts/smoke-adapters.mjs [baseUrl]   (default http://localhost:3105)
//
// Every adapter talks to a local recording proxy that forwards to the server, so we can assert the exact request
// (headers incl. x-hm-agent, Claude-shaped body) even for routes that aren't deployed yet. Payloads follow the
// field lists in each tool's hook docs (links in integrations/README.md). Asserts:
//   1. briefing: every adapter with a start hook returns the pack, in its tool's output shape, with the 🔒 lab rule
//   2. correction: prompts reach POST /api/hooks/prompt in the right shape; once that route exists, a Cursor
//      correction creates a ⏳ pending lesson
//   3. edits: every adapter records activity with its own x-hm-agent (checked in /api/activity/live once the
//      server stores `agent`)
//   4. cross-tool: a Claude Code edit then a Cursor edit on the same file → Cursor gets the collision warning
//   5. safety: with the server unreachable, every adapter prints its no-op output and exits 0
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trimStart().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = (process.argv[2] || "http://localhost:3105").replace(/\/+$/, "");
const TOKEN = process.env.HIVEMIND_TOKEN ?? "";
const REPO = "repo/export-service";
const repoDir = `${root}/demo/export-service`;
const stamp = Date.now();
let failed = 0;
let pending = 0;
const check = (ok, label, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
};
const wait = (label, why) => {
  console.log(`⏳ ${label} — ${why}`);
  pending++;
};

// ---- recording proxy ----
const seen = [];
const proxy = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const rec = { method: req.method, path: req.url, headers: req.headers, body: body ? JSON.parse(body) : null, status: 0 };
  seen.push(rec);
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const r = await fetch(BASE + req.url, { method: req.method, headers, body: body || undefined, signal: AbortSignal.timeout(60000) });
    rec.status = r.status;
    const text = await r.text();
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" }).end(text);
  } catch (e) {
    rec.status = 599;
    res.writeHead(502).end(JSON.stringify({ error: String(e) }));
  }
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const PROXY = `http://127.0.0.1:${proxy.address().port}`;

function adapter(tool, event, payload, { user = "michael", api = PROXY, cwd = repoDir } = {}) {
  return new Promise((resolve) => {
    const from = seen.length;
    const child = spawn(process.execPath, [`${root}/hooks/adapters/${tool}.mjs`, event], {
      cwd,
      env: { ...process.env, HIVEMIND_API_URL: api, HIVEMIND_USER: user, HIVEMIND_REPO: REPO, HIVEMIND_TOKEN: TOKEN },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stdin.end(JSON.stringify(payload));
    child.on("close", (code) => {
      let json = null;
      try {
        json = JSON.parse(out || "null");
      } catch {}
      resolve({ code, out, json, reqs: seen.slice(from) });
    });
  });
}

const AGENT = { cursor: "cursor", gemini: "gemini-cli", codex: "codex", copilot: "copilot", windsurf: "windsurf" };
const hdrOk = (r, tool, user = "michael") =>
  r?.headers.authorization === `Bearer ${TOKEN}` && r.headers["x-hm-agent"] === AGENT[tool] && r.headers["x-hm-user"] === user && r.headers["x-hm-repo"] === REPO;

// Documented payload builders: base fields + per-event fields.
const P = {
  cursor: (event, extra) => ({
    hook_event_name: event, conversation_id: `smoke-cursor-${stamp}`, generation_id: "gen-1", model: "claude-sonnet-5-5",
    cursor_version: "2.4.0", workspace_roots: [repoDir], user_email: "dev@meridian.example", transcript_path: null, ...extra,
  }),
  gemini: (event, extra) => ({
    hook_event_name: event, session_id: `smoke-gemini-${stamp}`, transcript_path: "/tmp/t.json", cwd: repoDir, timestamp: new Date().toISOString(), ...extra,
  }),
  codex: (event, extra) => ({
    hook_event_name: event, session_id: `smoke-codex-${stamp}`, transcript_path: null, cwd: repoDir, model: "gpt-5.5-codex", turn_id: "t1", permission_mode: "default", ...extra,
  }),
  copilot: (event, extra) => ({ hook_event_name: event, session_id: `smoke-copilot-${stamp}`, timestamp: new Date().toISOString(), cwd: repoDir, ...extra }),
  copilotCli: (extra) => ({ sessionId: `smoke-copilot-cli-${stamp}`, timestamp: Date.now(), cwd: repoDir, ...extra }),
  windsurf: (action, tool_info) => ({
    agent_action_name: action, trajectory_id: `smoke-windsurf-${stamp}`, execution_id: "e1", timestamp: new Date().toISOString(), model_name: "SWE-1.5", tool_info,
  }),
};

// ---- 1. briefing ----
console.log("\n1. Briefing at session start");
const lab = (t) => /🔒|LOCKED RULE/.test(t ?? "") && /lab customers/i.test(t ?? "");
const briefs = [
  ["cursor", "sessionStart", P.cursor("sessionStart", { session_id: `smoke-cursor-${stamp}`, is_background_agent: false, composer_mode: "agent" }), (j) => j?.additional_context],
  ["gemini", "SessionStart", P.gemini("SessionStart", { source: "startup" }), (j) => j?.hookSpecificOutput?.additionalContext],
  ["codex", "SessionStart", P.codex("SessionStart", { source: "startup" }), (j) => j?.hookSpecificOutput?.additionalContext],
  ["copilot", "SessionStart", P.copilot("SessionStart", { source: "new" }), (j) => j?.hookSpecificOutput?.additionalContext],
  ["copilot", "sessionStart", P.copilotCli({ source: "new", initialPrompt: "" }), (j) => j?.additionalContext],
];
for (const [tool, event, payload, pick] of briefs) {
  const r = await adapter(tool, event, payload);
  const text = pick(r.json);
  check(r.code === 0 && lab(text), `${tool} ${event} briefing has the locked lab rule`, `${text?.length ?? 0} chars`);
  check(hdrOk(r.reqs[0], tool) && /^\/api\/context-pack\?/.test(r.reqs[0]?.path ?? ""), `${tool} ${event} → GET /api/context-pack with x-hm-agent: ${AGENT[tool]}`);
}

// ---- 2. correction capture ----
console.log("\n2. Correction capture");
// Novel on purpose (a restatement of an existing lesson is merged, not added). Reject it in the Approvals queue after.
const correction = `No, that's wrong: in the smoke-fixtures folder never call Date.now() directly, always use the fixtureClock() helper so fixture timestamps stay deterministic (smoke ${stamp}).`;
const neutral = "Add a unit test for the retry path in export.ts.";
const prompts = [
  ["cursor", "beforeSubmitPrompt", P.cursor("beforeSubmitPrompt", { prompt: correction, attachments: [] }), correction, (r) => r.json?.continue === true],
  ["gemini", "BeforeAgent", P.gemini("BeforeAgent", { prompt: neutral }), neutral, (r) => r.json !== null],
  ["codex", "UserPromptSubmit", P.codex("UserPromptSubmit", { prompt: neutral }), neutral, (r) => r.json !== null],
  ["copilot", "UserPromptSubmit", P.copilot("UserPromptSubmit", { prompt: neutral }), neutral, (r) => r.json !== null],
  ["copilot", "userPromptSubmitted", P.copilotCli({ prompt: neutral }), neutral, (r) => r.json !== null],
  ["windsurf", "pre_user_prompt", P.windsurf("pre_user_prompt", { user_prompt: neutral }), neutral, (r) => r.out === ""],
];
let promptStatus = 0;
for (const [tool, event, payload, text, outOk] of prompts) {
  const r = await adapter(tool, event, payload);
  const q = r.reqs.find((x) => x.path === "/api/hooks/prompt");
  if (tool === "cursor") promptStatus = q?.status ?? 0;
  const shape = q?.method === "POST" && hdrOk(q, tool) && q.body?.hook_event_name === "UserPromptSubmit" && q.body?.prompt === text && !!q.body?.session_id && q.body?.cwd === repoDir;
  check(r.code === 0 && outOk(r) && shape, `${tool} ${event} → POST /api/hooks/prompt (Claude shape)`, `server HTTP ${q?.status}`);
}
if (promptStatus >= 200 && promptStatus < 300) {
  let found = null;
  for (let i = 0; i < 10 && !found; i++) {
    const m = await fetch(`${BASE}/api/memories?status=pending,active,blocked`, { headers: { "x-hm-user": "noor", "x-hm-role": "security" } }).then((r) => r.json());
    found = (m.memories ?? []).find((x) => JSON.stringify(x).includes(`smoke ${stamp}`));
    if (!found) await new Promise((r) => setTimeout(r, 2000));
  }
  check(!!found && found.status === "pending", "Cursor correction created (or reinforced) a ⏳ pending lesson", found ? `${found.status}: "${found.title}"` : "not found");
} else {
  wait("Cursor correction → pending lesson", `/api/hooks/prompt returned HTTP ${promptStatus} (B's route not on this server yet); request shape verified above`);
}

// ---- 3. edits record activity per agent ----
console.log("\n3. Edits record activity with the right agent");
const f = (tool) => `src/smoke-${tool}-${stamp}.ts`;
const editCases = [
  ["cursor", "afterFileEdit", P.cursor("afterFileEdit", { file_path: `${repoDir}/${f("cursor")}`, edits: [{ old_string: "a", new_string: "b" }] }), `smoke-cursor-${stamp}`],
  ["gemini", "AfterTool", P.gemini("AfterTool", { tool_name: "replace", tool_input: { file_path: `${repoDir}/${f("gemini")}`, old_string: "a", new_string: "b" }, tool_response: { llmContent: "ok", returnDisplay: "ok" } }), `smoke-gemini-${stamp}`],
  ["codex", "PostToolUse", P.codex("PostToolUse", { tool_name: "apply_patch", tool_use_id: "call_1", tool_input: { input: `*** Begin Patch\n*** Update File: ${f("codex")}\n@@\n-a\n+b\n*** End Patch` }, tool_response: { output: "Success" } }), `smoke-codex-${stamp}`],
  ["copilot", "PostToolUse", P.copilot("PostToolUse", { tool_name: "editFiles", tool_use_id: "t1", tool_input: { files: [`${repoDir}/${f("copilot")}`] }, tool_response: "ok" }), `smoke-copilot-${stamp}`],
  ["windsurf", "post_write_code", P.windsurf("post_write_code", { file_path: `${repoDir}/${f("windsurf")}`, edits: [{ old_string: "a", new_string: "b" }] }), `smoke-windsurf-${stamp}`],
];
for (const [tool, event, payload] of editCases) {
  const r = await adapter(tool, event, payload);
  const q = r.reqs.find((x) => x.path === "/api/hooks/tool");
  const shape = hdrOk(q, tool) && q.body?.tool_name === "Edit" && q.body?.tool_input?.file_path === `${repoDir}/${f(tool)}` && q.body?.cwd === repoDir;
  check(r.code === 0 && shape && q.status === 200, `${tool} ${event} → POST /api/hooks/tool for ${f(tool)}`, `HTTP ${q?.status}`);
}
const live = await fetch(`${BASE}/api/activity/live`).then((r) => r.json());
const items = live.items ?? [];
for (const [tool, , , session] of editCases) {
  const it = items.find((i) => i.sessionId === session);
  if (!it) check(false, `${tool} edit appears in /api/activity/live`);
  else if (it.agent === undefined) wait(`${tool} activity agent = ${AGENT[tool]}`, "recorded, but the server doesn't store/return `agent` yet (C's attribution change)");
  else check(it.agent === AGENT[tool], `${tool} activity has agent = ${AGENT[tool]}`, `got ${it.agent}`);
}

// ---- 4. cross-tool collision: Claude Code then Cursor on the same file ----
console.log("\n4. Cross-tool collision (Claude Code → Cursor)");
const shared = `src/smoke-shared-${stamp}.ts`;
const claude = await fetch(`${BASE}/api/hooks/tool`, {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-hm-user": "adrian", "x-hm-repo": REPO, "x-hm-agent": "claude-code" },
  body: JSON.stringify({ hook_event_name: "PostToolUse", session_id: `smoke-claude-${stamp}`, cwd: repoDir, tool_name: "Edit", tool_input: { file_path: `${repoDir}/${shared}`, old_string: "a", new_string: "b" }, tool_response: { success: true } }),
});
check(claude.ok, "Claude Code PostToolUse recorded", `HTTP ${claude.status}`);
const cur = await adapter("cursor", "afterFileEdit", P.cursor("afterFileEdit", { conversation_id: `smoke-cursor-x-${stamp}`, file_path: `${repoDir}/${shared}`, edits: [] }), { user: "michael" });
const warnText = cur.json?.additional_context ?? "";
console.log("   cursor ←", warnText.replace(/\n/g, " | "));
check(/@adrian's Claude Code agent edited (src.)?smoke-shared/.test(warnText), "Cursor session is warned about the Claude Code session's edit");
const gem = await adapter("gemini", "AfterTool", P.gemini("AfterTool", { session_id: `smoke-gemini-x-${stamp}`, tool_name: "write_file", tool_input: { file_path: `${repoDir}/${shared}`, content: "x" } }), { user: "sam" });
check(/@michael's Cursor agent edited/.test(gem.json?.systemMessage ?? "") && /@adrian's Claude Code agent/.test(gem.json?.systemMessage ?? ""), "…and a Gemini CLI session after that is warned about both, by tool", (gem.json?.systemMessage ?? "").split("\n").length - 1 + " warnings");

// ---- session end shape ----
const se = await adapter("cursor", "sessionEnd", P.cursor("sessionEnd", { session_id: `smoke-cursor-${stamp}`, reason: "completed", duration_ms: 45000, is_background_agent: false, final_status: "completed" }));
const seq = se.reqs.find((x) => x.path === "/api/hooks/session-end");
check(se.code === 0 && JSON.stringify(se.json) === "{}" && seq?.body?.session_id === `smoke-cursor-${stamp}` && hdrOk(seq, "cursor"), "cursor sessionEnd → POST /api/hooks/session-end, prints {}", `server HTTP ${seq?.status}`);

// ---- 5. never break the host session ----
console.log("\n5. Server down → no-op output, exit 0");
const down = { api: "http://127.0.0.1:9" };
const noops = [
  ["cursor", "beforeSubmitPrompt", P.cursor("beforeSubmitPrompt", { prompt: "x" }), (r) => r.json?.continue === true],
  ["cursor", "sessionStart", P.cursor("sessionStart", {}), (r) => /unavailable/.test(r.json?.additional_context ?? "")],
  ["gemini", "AfterTool", P.gemini("AfterTool", { tool_name: "replace", tool_input: { file_path: "a.ts" } }), (r) => JSON.stringify(r.json) === "{}"],
  ["codex", "SessionStart", P.codex("SessionStart", {}), (r) => /unavailable/.test(r.json?.hookSpecificOutput?.additionalContext ?? "")],
  ["copilot", "PostToolUse", P.copilot("PostToolUse", { tool_name: "editFiles", tool_input: { files: ["a.ts"] } }), (r) => JSON.stringify(r.json) === "{}"],
  ["windsurf", "post_write_code", P.windsurf("post_write_code", { file_path: "a.ts" }), (r) => r.out === ""],
];
for (const [tool, event, payload, ok] of noops) {
  const r = await adapter(tool, event, payload, down);
  check(r.code === 0 && ok(r), `${tool} ${event} degrades safely`, r.out.slice(0, 60));
}
const junk = await new Promise((resolve) => {
  const c = spawn(process.execPath, [`${root}/hooks/adapters/cursor.mjs`, "beforeSubmitPrompt"], { env: { ...process.env, HIVEMIND_API_URL: down.api } });
  let out = "";
  c.stdout.on("data", (d) => (out += d));
  c.stdin.end("not json {");
  c.on("close", (code) => resolve({ code, out }));
});
check(junk.code === 0 && junk.out === '{"continue":true}', "cursor survives a malformed payload");

proxy.close();
console.log(`\n${failed ? `${failed} check(s) failed` : "all checks passed"}${pending ? `, ${pending} waiting on server changes` : ""}`);
process.exit(failed ? 1 : 0);
