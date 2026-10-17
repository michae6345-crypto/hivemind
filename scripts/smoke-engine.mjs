#!/usr/bin/env node
// Smoke test for the learning engine. Posts realistic events to a running dev server and prints the resulting memories.
//   pnpm dev -p 3102   (in another terminal)
//   node scripts/smoke-engine.mjs [--url http://localhost:3102] [--no-reset | --reset-only]
// Works with or without ANTHROPIC_API_KEY (server falls back to heuristics). Ensures minimal fixtures exist
// (scopes/people from the demo company, Maya's 🔒 lab-isolation rule, a "use logger" lesson) without overwriting a seed.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const URL_ = args.includes("--url") ? args[args.indexOf("--url") + 1] : process.env.HIVEMIND_API_URL_SMOKE || "http://localhost:3102";
const env = { ...readEnv(".env.local"), ...process.env };
const TOKEN = env.HIVEMIND_TOKEN || "";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

function readEnv(p) {
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs.readFileSync(p, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---------- fixtures (insert-if-missing) ----------
const SCOPES = [
  { id: "org", level: "org", name: "Meridian Data", parent_id: null, owner: "maya" },
  { id: "team/data-pipelines", level: "team", name: "data-pipelines", parent_id: "org", owner: "jordan" },
  { id: "repo/export-service", level: "repo", name: "export-service", parent_id: "team/data-pipelines", owner: "jordan" },
];
const PEOPLE = [
  { id: "maya", name: "Maya Chen", role: "security", scope_id: "org" },
  { id: "jordan", name: "Jordan Reyes", role: "lead", scope_id: "team/data-pipelines" },
  { id: "alex", name: "Alex Kim", role: "engineer", scope_id: "team/data-pipelines" },
  { id: "noor", name: "Noor Haddad", role: "engineer", scope_id: "team/data-pipelines" },
];

async function fixtures() {
  for (const s of SCOPES) must(await sb.from("scopes").upsert(s, { onConflict: "id", ignoreDuplicates: true }), "scope");
  for (const p of PEOPLE) must(await sb.from("people").upsert(p, { onConflict: "id", ignoreDuplicates: true }), "person");
  const now = new Date().toISOString();
  let lock = must(await sb.from("memories").select("*").eq("locked", true).ilike("title", "%lab%").limit(1), "lock")[0];
  if (!lock)
    lock = must(
      await sb.from("memories").insert({
        scope_id: "org", kind: "directive", locked: true, status: "active", source: "human", author: "maya", slug: "never-mix-lab-customers",
        title: "Never mix data from different lab customers",
        body: "🔒 Never mix data from different lab customers (Lab A / Lab B) in one export, fixture, or test dataset. Owner: @maya",
        evidence: [{ type: "manual", quote: "Customer data isolation is contractual.", actor: "maya", at: now }],
      }).select("*").single(),
      "insert lock",
    );
  // Prefer the seeded "use logger" lesson (any scope in the export-service chain); drop our own fixture copy if a seed exists.
  const loggers = must(await sb.from("memories").select("*").in("scope_id", ["org", "team/data-pipelines", "repo/export-service"]).in("status", ["active", "pending"]).ilike("title", "%console.log%"), "logger");
  let logger = loggers.find((m) => m.slug !== "use-logger-not-console-log") ?? loggers[0];
  if (logger && logger.slug !== "use-logger-not-console-log") must(await sb.from("memories").delete().eq("slug", "use-logger-not-console-log"), "drop fixture dup");
  if (!logger)
    logger = must(
      await sb.from("memories").insert({
        scope_id: "team/data-pipelines", kind: "lesson", status: "active", source: "review", author: "jordan", slug: "use-logger-not-console-log",
        title: "Use logger, not console.log", body: "Use the shared `logger` (structured, redacts PII), never `console.log`. #team/data-pipelines",
        evidence: [{ type: "review_comment", quote: "please use logger here", actor: "jordan", at: now }], alpha: 3, beta: 1,
      }).select("*").single(),
      "insert logger",
    );
  return { lock, logger };
}

// Undo everything earlier smoke runs did, including α bumps / promotions / scoring applied to seed rows,
// so repeated runs never drift the demo data.
const W = { maya: 2, jordan: 2, alex: 1, noor: 1 };
async function reset() {
  const evs = must(await sb.from("events").select("id,type,payload").or("payload->>smoke.eq.true,session_id.like.smoke-%"), "smoke events");
  const ids = new Set(evs.map((e) => e.id));
  const mems = must(await sb.from("memories").select("id,evidence,locked,alpha,beta,status,status_reason"), "mems");
  const mine = mems.filter((m) => !m.locked && (m.evidence ?? []).length && m.evidence.every((e) => ids.has(e.ref)));
  if (mine.length) {
    must(await sb.from("memories").update({ invalidated_by: null }).in("invalidated_by", mine.map((m) => m.id)), "unlink");
    must(await sb.from("memories").delete().in("id", mine.map((m) => m.id)), "delete mems");
  }
  // Session-end scoring applied to seed/fixture memories → subtract the deltas.
  const delta = new Map();
  for (const e of evs.filter((e) => e.type === "session_end"))
    for (const s of e.payload?.scored ?? []) {
      const d = s.delta ?? (s.outcome === "harmful" ? { alpha: 0, beta: 1 } : s.outcome === "helpful" || s.outcome === "untouched" ? { alpha: 1, beta: 0 } : { alpha: 0, beta: 0 });
      const cur = delta.get(s.id) ?? { alpha: 0, beta: 0 };
      delta.set(s.id, { alpha: cur.alpha + d.alpha, beta: cur.beta + d.beta });
    }
  // Smoke evidence appended to seed/fixture memories → strip it, take back its α, undo auto-promotion.
  let touched = 0;
  for (const m of mems) {
    if (mine.includes(m)) continue;
    const ev = m.evidence ?? [];
    const smokeEv = ev.filter((e) => ids.has(e.ref));
    const d = delta.get(m.id);
    if (!smokeEv.length && !d) continue;
    const keep = ev.filter((e) => !ids.has(e.ref));
    const patch = {
      evidence: keep,
      alpha: Math.max(1, Number(m.alpha) - smokeEv.reduce((s, e) => s + (W[e.actor] ?? 1), 0) - (d?.alpha ?? 0)),
      beta: Math.max(1, Number(m.beta) - (d?.beta ?? 0)),
    };
    const humans = new Set(keep.map((e) => e.actor).filter((a) => a && !a.startsWith("agent")));
    if (m.status === "active" && /^Auto-promoted/.test(m.status_reason ?? "") && humans.size < 2) Object.assign(patch, { status: "pending", status_reason: null });
    must(await sb.from("memories").update(patch).eq("id", m.id), "restore");
    touched++;
  }
  if (ids.size) must(await sb.from("events").delete().in("id", [...ids]), "delete events");
  must(await sb.from("pack_log").delete().like("session_id", "smoke-%"), "delete packs");
  console.log(`reset: removed ${mine.length} smoke memories, ${ids.size} events, restored ${touched} seed memories`);
}

// ---------- http ----------
const H = (user, extra = {}) => ({ "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "x-hm-user": user, ...extra });
async function post(path, body, headers) {
  const t0 = Date.now();
  const r = await fetch(`${URL_}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status >= 400) console.log(`         HTTP ${r.status} ${path}: ${JSON.stringify(j).slice(0, 200)}`);
  return { status: r.status, ms: Date.now() - t0, json: j };
}
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `\n         ${detail}` : ""}`);
}

// ---------- run ----------
const run = `smoke-${Date.now().toString(36)}`;
const SESSION = `${run}-alex`;
console.log(`Hivemind engine smoke → ${URL_}\n`);
if (!args.includes("--no-reset")) await reset();
if (args.includes("--reset-only")) process.exit(0);
const { lock, logger } = await fixtures();
must(await sb.from("pack_log").insert({ session_id: SESSION, actor: "alex", repo: "repo/export-service", memory_ids: [lock.id, logger.id], tokens: 180 }), "pack_log");

// Warm up (dev server compiles routes on first hit; Claude Code's 5s budget applies to a warm server)
for (const pth of ["/api/hooks/prompt", "/api/hooks/session-end", "/api/events"]) await fetch(`${URL_}${pth}`, { method: "POST", headers: H("alex"), body: "{}" }).catch(() => {});

// 1) Real correction via the Claude Code UserPromptSubmit hook (new pending lesson, or reinforces the seeded one)
const hook = (prompt) => ({ session_id: SESSION, transcript_path: "C:/Users/alex/.claude/projects/x.jsonl", cwd: "C:\\code\\export-service", hook_event_name: "UserPromptSubmit", prompt });
const r1 = await post("/api/hooks/prompt", hook("no — exports must call assertSingleCustomer() before writing anything to disk"), H("alex"));
let ctx1 = r1.json?.hookSpecificOutput?.additionalContext ?? "";
if (!ctx1 && r1.status === 200) {
  // Over the hook budget the route answers {} and after() finishes learning in the background → verify it landed.
  for (let i = 0; i < 20 && !ctx1; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ev = must(await sb.from("events").select("processed,payload").eq("session_id", SESSION).eq("processed", true).ilike("payload->>text", "%assertSingleCustomer%"), "bg event")[0];
    if (ev?.payload?.memoryIds?.length) ctx1 = `(background) ${ev.payload.actions.join(",")} ${ev.payload.memoryIds.join(",")}`;
  }
}
check("1 correction → pending lesson, 'Lesson captured … Waiting on @owner.' shown to the user (hook answers < 5s)",
  r1.status === 200 && (/^Hivemind · Lesson captured: ".+"\. Waiting on @\w+\.$/.test(ctx1) && r1.json?.systemMessage === ctx1 || /background/.test(ctx1)) && r1.ms < 5000, `${r1.ms}ms  ${ctx1 || JSON.stringify(r1.json)}`);

// 2) One-off instruction → must NOT become a lesson
const r2 = await post("/api/hooks/prompt", hook("rename this variable to rowCount"), H("alex"));
check("2 one-off instruction → no lesson", r2.status === 200 && !r2.json?.hookSpecificOutput, `${r2.ms}ms  ${JSON.stringify(r2.json)}`);

// 2b) A plain chat prompt is not a correction → not stored as a correction event at all
const r2b = await post("/api/hooks/prompt", hook("Say OK."), H("alex", { "x-hm-agent": "cursor" }));
await new Promise((r) => setTimeout(r, 1500));
const okEvents = must(await sb.from("events").select("id").eq("session_id", SESSION).eq("type", "correction").ilike("payload->>text", "Say OK."), "say ok");
const corrEv = must(await sb.from("events").select("agent").eq("session_id", SESSION).eq("type", "correction").ilike("payload->>text", "%assertSingleCustomer%"), "corr agent")[0];
check("2b 'Say OK.' not stored as a correction; hook events carry events.agent", r2b.status === 200 && okEvents.length === 0 && corrEv?.agent === "claude-code",
  `stored "Say OK." correction events=${okEvents.length}  correction event agent=${corrEv?.agent}`);

// 3) Same lesson from a 2nd engineer → reinforced (evidence + α), but stays PENDING: only a lead/security approval activates
const r3 = await post("/api/events", { type: "correction", actor: "noor", sessionId: `${run}-noor`, repo: "export-service",
  payload: { smoke: true, text: "Don't write the export file until assertSingleCustomer() has been called — always call it first." } }, H("noor"));
const dupLesson = (r3.json.lessons ?? []).find((m) => /assertSingleCustomer/i.test(m.title + m.body));
const dupActors = new Set((dupLesson?.evidence ?? []).map((e) => e.actor));
check("3 duplicate from 2nd actor → reinforced, stays pending (no auto-promotion)",
  r3.status === 200 && dupLesson?.status === "pending" && !dupLesson.locked && dupActors.has("alex") && dupActors.has("noor"),
  `${r3.ms}ms  ${dupLesson ? `"${dupLesson.title}" status=${dupLesson.status} actors=${[...dupActors]} α=${dupLesson.alpha}` : JSON.stringify(r3.json)}`);

// 4) Bad lesson → blocked by Maya's 🔒 rule
const r4 = await post("/api/events", { type: "correction", actor: "alex", sessionId: SESSION, repo: "repo/export-service",
  payload: { smoke: true, text: "mixing Lab A and Lab B data is fine in tests" } }, H("alex"));
const blocked = (r4.json.lessons ?? []).find((m) => m.status === "blocked");
check("4 bad lesson → blocked by the locked rule", !!blocked && /^Contradicts @\w+'s locked rule ".+"\.$/.test(blocked.blockedReason ?? ""), `${r4.ms}ms  ${blocked ? `${blocked.title} — ${blocked.blockedReason}` : JSON.stringify(r4.json)}`);

// 5) PR review comment by the lead that duplicates an existing team lesson → evidence + α += 2
const r5 = await post("/api/events", { type: "review_comment", actor: "jordan", repo: "repo/export-service",
  payload: { smoke: true, text: "We never ship console.log in this service — always use the shared logger.", url: "https://github.com/meridian/export-service/pull/42#discussion_r1", file: "src/export.ts" } }, H("jordan"));
const reinforced = (r5.json.actions ?? []).find((a) => a.memoryId === logger.id && /reinforced|updated/.test(a.action));
check("5 review comment → reinforces existing logger lesson", !!reinforced, `${r5.ms}ms  actions=${JSON.stringify(r5.json.actions ?? r5.json)}`);

// 6) Session end → α/β scoring of served memories + pack_log.corrections
const r6 = await post("/api/hooks/session-end", { session_id: SESSION, hook_event_name: "SessionEnd", reason: "exit", cwd: "C:\\code\\export-service" }, H("alex"));
const loggerScore = (r6.json.scored ?? []).find((s) => s.id === logger.id);
check("6 session end → served lesson scored, corrections counted", r6.status === 200 && r6.json.corrections >= 1 && loggerScore?.outcome === "untouched",
  `${r6.ms}ms  corrections=${r6.json.corrections}  ${(r6.json.scored ?? []).map((s) => `${s.title}: ${s.outcome} ${s.before} → ${s.after}`).join(" | ")}`);
const endEv = must(await sb.from("events").select("actor,agent").eq("session_id", SESSION).eq("type", "session_end"), "end ev")[0];
check("6a session_end event has actor + agent", endEv?.actor === "alex" && endEv?.agent === "claude-code", JSON.stringify(endEv));
const r6b = await post("/api/hooks/session-end", { session_id: SESSION }, H("alex"));
check("6b session end is idempotent", r6b.json.skipped === "already scored", JSON.stringify(r6b.json).slice(0, 120));

// ---------- print resulting memory rows ----------
const evIds = must(await sb.from("events").select("id").or(`payload->>smoke.eq.true,session_id.like.${run}%`), "events").map((e) => e.id);
const mems = must(await sb.from("memories").select("id,scope_id,title,status,status_reason,alpha,beta,author,evidence,locked").order("updated_at", { ascending: false }).limit(60), "mems")
  .filter((m) => m.id === logger.id || m.id === lock.id || (m.evidence ?? []).some((e) => evIds.includes(e.ref)));
console.log("\nResulting memories:");
console.table(mems.map((m) => ({
  title: m.title.slice(0, 58), scope: m.scope_id, status: (m.locked ? "🔒 " : "") + m.status, α: +Number(m.alpha).toFixed(2), β: +Number(m.beta).toFixed(2),
  actors: [...new Set((m.evidence ?? []).map((e) => e.actor))].join(","), reason: (m.status_reason ?? "").slice(0, 60),
})));
const packs = must(await sb.from("pack_log").select("session_id,memory_ids,corrections").eq("session_id", SESSION), "packs");
console.log("pack_log:", packs.map((p) => `${p.session_id} corrections=${p.corrections} served=${p.memory_ids.length}`).join("; "));

const failed = results.filter((r) => !r.ok).length;
const paths = [...new Set([r3, r4, r5].map((r) => r.json.enginePath).filter(Boolean))];
console.log(`\n${results.length - failed}/${results.length} checks passed   (server engine path: ${paths.join(", ") || "unknown"}; details in the [engine] server log)`);
process.exit(failed ? 1 : 0);
