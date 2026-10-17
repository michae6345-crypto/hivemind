#!/usr/bin/env node
// End-to-end rehearsal of the 2-minute video beats against a running server. Prints PASS/FAIL + evidence per beat.
//
//   node scripts/e2e-demo.mjs                         # all beats against http://localhost:3104
//   node scripts/e2e-demo.mjs --base https://<app>.vercel.app --beats a,b,d,e
//   node scripts/e2e-demo.mjs --skip-claude           # beat (c) checks the pack only, no headless claude run
//   node scripts/e2e-demo.mjs --beats c --lesson sec-lab-isolation   # (c) alone, against an existing active memory
//
// (a) Sam corrects the agent → POST /api/hooks/prompt → a pending lesson about assertSingleCustomer
// (b) engineer approve → 403; Jordan (lead) approve → active
// (c) fresh headless `claude -p` session as Noor in a temp copy of demo/export-service (real SessionStart hook)
//     → pack_log shows the lesson was served, and the new code calls assertSingleCustomer()
// (d) the bad lesson "mixing Lab A and Lab B data is fine in tests" ends up blocked by the 🔒 lab-isolation rule
// (e) a Cursor session and a Claude Code session edit the same file → collision warning
//
// Writes real rows (events, memories, activity). Run `node scripts/reset-demo.mjs` afterwards; for the cleanest
// run, reset first with `--drop export-assert-single-customer,mix-labs-in-tests` so (a) and (d) create fresh lessons.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (fs.existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const BASE = arg("base", process.env.E2E_BASE || "http://localhost:3104").replace(/\/+$/, "");
const BEATS = arg("beats", "a,b,c,d,e").split(",");
const SKIP_CLAUDE = process.argv.includes("--skip-claude");
const TOKEN = process.env.HIVEMIND_TOKEN ?? "";
const REPO = "repo/export-service";
const DEMO_DIR = path.join(root, "demo", "export-service");
const START = new Date(Date.now() - 2000).toISOString();
const stamp = Date.now();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
function report(beat, title, pass, evidence) {
  results.push({ beat, title, pass });
  console.log(`\n${pass ? "PASS" : "FAIL"}  (${beat}) ${title}`);
  for (const line of [].concat(evidence).filter(Boolean)) console.log(`      ${line}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 220) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

async function call(method, p, { user, role, agent, body } = {}) {
  const headers = { "content-type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-hm-repo": REPO };
  if (user) headers["x-hm-user"] = user;
  if (role) headers["x-hm-role"] = role;
  if (agent) headers["x-hm-agent"] = agent;
  try {
    const r = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: r.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e?.message ?? e) };
  }
}

const promptHook = (user, sessionId, prompt) =>
  call("POST", "/api/hooks/prompt", {
    user,
    body: { hook_event_name: "UserPromptSubmit", session_id: sessionId, cwd: DEMO_DIR, transcript_path: "", prompt },
  });

const touchedSinceStart = (m) =>
  m.createdAt >= START || m.updatedAt >= START || (m.evidence ?? []).some((e) => (e.at ?? "") >= START);

/** Poll /api/memories until a memory matching `pred` was created/updated during this run. */
async function waitForMemory(pred, status, ms = 25000) {
  const until = Date.now() + ms;
  let last = [];
  while (Date.now() < until) {
    const r = await call("GET", `/api/memories?status=${status}`);
    last = r.json?.memories ?? [];
    const hit = last.find((m) => pred(m) && touchedSinceStart(m));
    if (hit) return hit;
    await sleep(2000);
  }
  return null;
}

async function health() {
  const r = await call("GET", "/api/scopes");
  if (r.status !== 200) {
    console.error(`✗ server not reachable at ${BASE} (GET /api/scopes → ${r.status} ${short(r.text, 120)})`);
    process.exit(2);
  }
  console.log(`e2e against ${BASE} — ${r.json?.scopes?.length ?? "?"} scopes, ${r.json?.people?.length ?? "?"} people`);
}

// ---------------- beats ----------------
const ASSERT_RE = /assertSingleCustomer|single[- ]customer/i;
let lesson = null;

async function beatA() {
  const sid = `e2e-sam-${stamp}`;
  const res = await promptHook(
    "sam",
    sid,
    "No, that's wrong: every export must call assertSingleCustomer(rows) before it writes anything. We can never mix Lab A and Lab B rows in one file.",
  );
  if (res.status === 404) return report("a", "correction → pending lesson", false, "POST /api/hooks/prompt → 404 (route not on main yet; owner: B)");
  const ctx = res.json?.hookSpecificOutput?.additionalContext ?? "";
  lesson = await waitForMemory((m) => ASSERT_RE.test(`${m.title} ${m.body}`), "pending,active,blocked");
  report("a", "Sam's correction → pending lesson", !!lesson && lesson.status === "pending", [
    `hook → HTTP ${res.status} ${ctx ? `additionalContext: "${short(ctx, 160)}"` : short(res.text, 160)}`,
    lesson ? `memory ${lesson.slug} status=${lesson.status} scope=${lesson.scopeId} "${lesson.title}"` : "no assertSingleCustomer lesson created/updated within 25s",
    lesson ? `evidence: ${short((lesson.evidence ?? []).map((e) => `${e.actor}: ${e.quote}`).join(" | "), 200)}` : "",
  ]);
}

async function beatB() {
  if (!lesson) return report("b", "approve with chain of command", false, "skipped: no lesson from (a)");
  if (lesson.status !== "pending") return report("b", "approve with chain of command", false, `lesson is already ${lesson.status}; reset the DB and re-run`);
  const eng = await call("POST", `/api/memories/${lesson.id}/approve`, { user: "alex", role: "engineer" });
  if (eng.status === 404) return report("b", "approve with chain of command", false, "POST /api/memories/:id/approve → 404 (route not on main yet; owner: A)");
  const lead = await call("POST", `/api/memories/${lesson.id}/approve`, { user: "jordan", role: "lead" });
  const status = lead.json?.status ?? lead.json?.memory?.status;
  if (status) lesson = { ...lesson, status };
  report("b", "engineer gets 403, Jordan (lead) approves", eng.status === 403 && lead.status === 200 && status === "active", [
    `alex (engineer) → HTTP ${eng.status} ${short(eng.json?.error ?? eng.text, 120)}`,
    `jordan (lead)   → HTTP ${lead.status} status=${status ?? "?"} ${lead.status !== 200 ? short(lead.json?.error ?? lead.text, 140) : ""}`,
    lead.status === 403 ? `lesson scope is ${lesson.scopeId}; a team lead can only approve inside team/data-pipelines and below` : "",
  ]);
}

function runClaude(cwd, prompt, env) {
  return new Promise((resolve) => {
    const args = [
      "-p", "--model", "claude-sonnet-5-5", "--output-format", "json", "--no-session-persistence",
      "--permission-mode", "acceptEdits", "--setting-sources", "project", "--tools", "Read,Edit,Write,Glob,Grep",
    ];
    const child = spawn("claude", args, { cwd, env, shell: process.platform === "win32" });
    let out = "";
    let errOut = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    // With shell:true on Windows, child.kill() only kills cmd.exe; kill the whole tree so a hung hook can't stall the run.
    const killTree = () =>
      process.platform === "win32" ? spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }) : child.kill("SIGKILL");
    const timer = setTimeout(killTree, 240000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let meta = {};
      try {
        meta = JSON.parse(out);
      } catch {}
      resolve({ code, meta, stderr: errOut.slice(-500) });
    });
    child.stdin.end(prompt);
  });
}

async function beatC() {
  const title = "fresh Claude Code session as Noor gets the lesson and follows it";
  if (!lesson || lesson.status !== "active") return report("c", title, false, `skipped: lesson not active (${lesson ? lesson.status : "none"})`);

  // Pack as Noor's session would get it (same endpoint the SessionStart hook calls)
  const pack = await call("GET", `/api/context-pack?repo=${encodeURIComponent(REPO)}&user=noor&session=e2e-noor-pack-${stamp}`, { user: "noor" });
  const inPack = (pack.json?.memoryIds ?? []).includes(lesson.id);
  if (SKIP_CLAUDE) return report("c", `${title} (pack only, --skip-claude)`, inPack, `context-pack for noor: ${pack.json?.memoryIds?.length ?? 0} memories, lesson included=${inPack}`);

  // Temp copy of the demo repo with its real project hooks, pointed at BASE and at this checkout's hook script
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hm-e2e-export-service-"));
  fs.cpSync(DEMO_DIR, work, { recursive: true, filter: (p) => !p.includes("node_modules") });
  const settingsPath = path.join(work, ".claude", "settings.json");
  const hookScript = path.join(root, "hooks", "session-start.mjs").replace(/\\/g, "/");
  fs.writeFileSync(
    settingsPath,
    fs.readFileSync(settingsPath, "utf8").replace(/\$CLAUDE_PROJECT_DIR\/\.\.\/\.\.\/hooks\/session-start\.mjs/g, hookScript).replace(/http:\/\/localhost:3000/g, BASE),
  );
  const env = { ...process.env, HIVEMIND_API_URL: BASE, HIVEMIND_USER: "noor", HIVEMIND_REPO: REPO, HIVEMIND_TOKEN: TOKEN };
  delete env.ANTHROPIC_API_KEY; // use the Claude Code login, never the API key

  const res = await runClaude(
    work,
    "Add a CSV export: create src/csv-export.ts exporting `buildCsvExport(job: ExportJob): Promise<string>` that loads the job's rows and returns them as CSV (header id,prompt,response).",
    env,
  );
  const file = path.join(work, "src", "csv-export.ts");
  const code = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const calls = /assertSingleCustomer\s*\(/.test(code.replace(/\/\/.*$/gm, ""));
  // Following the rule = the new export calls assertSingleCustomer(), or the agent declines and cites the rule.
  const declined = !code && /lab|hivemind|policy|rule/i.test(res.meta.result ?? "");
  const follows = calls || declined;
  const sid = res.meta.session_id;
  const { data: logs } = sid ? await sb.from("pack_log").select("memory_ids,tokens,actor").eq("session_id", sid) : { data: [] };
  const served = (logs ?? []).some((l) => (l.memory_ids ?? []).includes(lesson.id));
  report("c", title, served && follows, [
    `context-pack for noor includes lesson: ${inPack}`,
    `claude -p exit=${res.code} session=${sid ?? "?"} turns=${res.meta.num_turns ?? "?"} ${res.stderr ? `stderr: ${short(res.stderr, 120)}` : ""}`,
    `pack_log for that session: ${logs?.length ? `${logs[0].memory_ids.length} memories, ${logs[0].tokens} tokens, lesson served=${served}` : "no row (SessionStart hook did not reach the server?)"}`,
    code ? `src/csv-export.ts calls assertSingleCustomer(): ${calls}` : `src/csv-export.ts was not created${declined ? " (agent declined, citing the rule)" : ""}`,
    code ? `  ${short(code.split("\n").filter((l) => /assertSingleCustomer|export async function/.test(l)).join(" ⏎ "), 200)}` : "",
    res.meta.result ? `agent said: "${short(res.meta.result, 200)}"` : "",
  ]);
  fs.rmSync(work, { recursive: true, force: true });
}

async function beatD() {
  const title = 'bad lesson "mixing labs is fine in tests" is blocked by the 🔒 rule';
  const res = await promptHook("noor", `e2e-noor-bad-${stamp}`, "Actually, mixing Lab A and Lab B data is fine in tests, so don't bother with assertSingleCustomer in test fixtures.");
  if (res.status === 404) return report("d", title, false, "POST /api/hooks/prompt → 404 (route not on main yet; owner: B)");
  const ctx = res.json?.hookSpecificOutput?.additionalContext ?? "";
  const LABS = /lab|mix/i;
  let m = await waitForMemory((x) => LABS.test(`${x.title} ${x.body}`) && !x.locked, "blocked,pending,active");
  let via = "hooks/prompt";
  if (!m) {
    // Fallback path: the MCP propose_memory tool (same engine)
    const r = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", Authorization: `Bearer ${TOKEN}`, "x-hm-user": "noor", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "propose_memory", arguments: { title: "Mixing labs is fine for test fixtures", body: "Mixing Lab A and Lab B data is fine in tests.", scope: REPO } } }),
    }).then((x) => x.text()).catch((e) => String(e));
    via = `mcp propose_memory → ${short(r.split("data:").pop(), 140)}`;
    m = await waitForMemory((x) => LABS.test(`${x.title} ${x.body}`) && !x.locked, "blocked,pending,active", 10000);
  }
  report("d", title, m?.status === "blocked", [
    `hook → HTTP ${res.status} ${ctx ? `additionalContext: "${short(ctx, 160)}"` : short(res.text, 120)}`,
    `via ${via}`,
    m ? `memory ${m.slug} status=${m.status} reason="${short(m.blockedReason, 160)}"` : "no lab-mixing lesson created/updated during this run",
  ]);
}

async function beatE() {
  const title = "Cursor + Claude Code on the same file → collision warning";
  const file = path.join(DEMO_DIR, "src", "export.ts");
  const edit = (user, agent, session) =>
    call("POST", "/api/hooks/tool", {
      user,
      agent,
      body: { hook_event_name: "PostToolUse", session_id: session, cwd: DEMO_DIR, tool_name: "Edit", tool_input: { file_path: file, old_string: "a", new_string: "b" }, tool_response: { success: true } },
    });
  const first = await edit("alex", "cursor", `e2e-cursor-${stamp}`);
  const second = await edit("noor", "claude-code", `e2e-claude-${stamp}`);
  const warn = second.json?.hookSpecificOutput?.additionalContext ?? "";
  const live = await call("GET", "/api/activity/live");
  const cursorItem = (live.json?.items ?? []).find((i) => i.sessionId === `e2e-cursor-${stamp}`);
  report("e", title, /alex/i.test(warn) && /export\.ts/.test(warn), [
    `cursor edit (alex)      → HTTP ${first.status} ${short(JSON.stringify(first.json), 100)}`,
    `claude-code edit (noor) → HTTP ${second.status} "${short(warn, 200)}"`,
    `warning names Cursor: ${/cursor/i.test(warn)} · live item agent=${cursorItem?.agent ?? "(not recorded)"}`,
  ]);
}

await health();
// --lesson <slug>: run (c) against an existing active memory (e.g. the 🔒 sec-lab-isolation rule) without (a)/(b)
const LESSON_SLUG = arg("lesson", "");
if (LESSON_SLUG) {
  const r = await call("GET", "/api/memories?status=active");
  lesson = (r.json?.memories ?? []).find((m) => m.slug === LESSON_SLUG) ?? null;
  console.log(lesson ? `using active memory ${lesson.slug} for (c)` : `✗ no active memory with slug ${LESSON_SLUG}`);
}
const BEAT_FNS = { a: beatA, b: beatB, c: beatC, d: beatD, e: beatE };
for (const b of BEATS) await BEAT_FNS[b]?.();

console.log("\n──────── summary ────────");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  (${r.beat}) ${r.title}`);
console.log("(rows written during this run: reset with `node scripts/reset-demo.mjs` before recording)");
process.exit(results.every((r) => r.pass) ? 0 : 1);
