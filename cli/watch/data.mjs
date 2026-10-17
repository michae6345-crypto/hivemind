// What `hivemind watch` knows: one small API client, the scope chain, and the live feed turned into cards.
// Sources: GET /api/activity/live (edits, collisions, sessions, corrections, approvals), GET /api/memories (the queue and
// lesson titles for this repo's chain), GET /api/vscode/rules (counts, approver), POST /api/vscode/check (flags).
import { plain, toolName } from "./theme.mjs";

export function client(cfg) {
  const headers = (extra = {}) => ({
    authorization: `Bearer ${cfg.token ?? ""}`,
    "x-hm-user": cfg.actor,
    "x-hm-repo": cfg.repo,
    "x-hm-agent": process.env.HIVEMIND_AGENT || "cli",
    ...extra,
  });
  async function call(method, path, body, { role, timeout = 10000 } = {}) {
    const res = await fetch(cfg.url + path, {
      method,
      headers: headers({ ...(body ? { "content-type": "application/json" } : {}), ...(role ? { "x-hm-role": role } : {}) }),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { status: res.status });
    return data;
  }
  return {
    get: (path, opts) => call("GET", path, null, opts),
    post: (path, body, opts) => call("POST", path, body ?? {}, opts),
  };
}

// ---------- scopes & people ----------
export function chainOf(scopeId, scopes) {
  const by = new Map(scopes.map((s) => [s.id, s]));
  const out = [];
  for (let s = by.get(scopeId); s; s = by.get(s.parentId)) out.push(s.id);
  return out.length ? out : ["org"];
}
/** Nearest owner up the chain: repo/export-service → jordan. */
export function ownerOf(scopeId, scopes) {
  const by = new Map(scopes.map((s) => [s.id, s]));
  for (let s = by.get(scopeId); s; s = by.get(s.parentId)) if (s.owner) return s.owner;
  return null;
}
/** Same rule as src/lib/auth.ts canWrite: security anywhere; lead in their team subtree; engineer only personal/<self>. */
export function canApprove(me, m, scopes) {
  if (!me) return false;
  if (me.role === "security") return true;
  if (m.status === "blocked" || m.locked) return false;
  if (me.role === "lead") return chainOf(m.scopeId, scopes).includes(me.scopeId);
  return m.scopeId === `personal/${me.id}`;
}

// ---------- words ----------
export const at = (iso) => new Date(iso).getTime();
export function ago(iso, now = Date.now()) {
  const s = Math.max(0, (now - at(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function short(iso, now = Date.now()) {
  const s = Math.max(0, (now - at(iso)) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
export const handle = (actor) => (!actor || String(actor).startsWith("agent") ? "an agent" : `@${actor}`);
/** "@adrian's Cursor agent" / "@noor's Claude Code" / "an agent". */
export function whose(actor, agent, { suffix = "" } = {}) {
  const tool = toolName(agent);
  if (!actor || String(actor).startsWith("agent")) return tool ? `a ${tool} agent` : "an agent";
  return tool ? `@${actor}'s ${tool}${suffix}` : `@${actor}`;
}
export const base = (f) => String(f).split("/").pop();

/** "learned from @alex's correction · 3h ago" from the memory's first evidence. */
export function provenance(m, now) {
  const e = m?.evidence?.[0];
  if (!e) return m ? `written by ${handle(m.author)}` : "";
  const by = handle(e.actor);
  const when = ago(e.at, now);
  if (e.type === "correction") return `learned from ${by}'s correction · ${when}`;
  if (e.type === "review_comment") return `from ${by}'s code review · ${when}`;
  if (e.type === "agent") return `proposed by an agent · ${when}`;
  return `written by ${by} · ${when}`;
}
export const quote = (m) => plain(m?.evidence?.[0]?.quote ?? "");

/** "Contradicts 🔒 [[sec-lab-isolation]] (Maya, Security): isolation…" → the locked rule's title and owner. */
export function blockedBy(m, memById) {
  const r = String(m.blockedReason ?? "");
  const slug = r.match(/\[\[([^\]]+)\]\]/)?.[1];
  const rule = [...memById.values()].find((x) => x.slug === slug);
  const owner = rule?.author ?? r.match(/\((\w+)/)?.[1]?.toLowerCase() ?? "maya";
  return { title: rule?.title ?? slug ?? "a locked rule", owner, why: plain(r.split(/\):\s*/)[1] ?? "") };
}

// ---------- the feed ----------
/**
 * Live response + memories → cards (newest first). Keys are stable across polls so the app can tell what's new.
 * kinds: captured | proposed | approved | rejected | blocked | collision | session | edit | correction
 */
export function toCards(live, memById, ctx) {
  const { shortRepo, approverOf } = ctx;
  const cards = new Map();
  const put = (c) => {
    if (!cards.has(c.key)) cards.set(c.key, c);
  };
  const agentOfMem = new Map();
  for (const f of live.feed ?? []) if (f.memoryId && f.agent) agentOfMem.set(f.memoryId, f.agent);

  for (const f of live.feed ?? []) {
    const m = f.memoryId ? memById.get(f.memoryId) : null;
    const ours = m || f.repo === shortRepo;
    if (!ours) continue;
    const agent = f.agent ?? (m ? agentOfMem.get(m.id) : undefined);
    if (f.type === "session_start") {
      if (f.repo !== shortRepo) continue;
      const nums = (f.text.match(/(\d+) lessons and (\d+)/) ?? []).slice(1).map(Number);
      const n = nums.length ? nums[0] + nums[1] : 0;
      put({ key: f.id, kind: "session", at: f.at, actor: f.actor, agent, line: `${whose(f.actor, agent)} loaded ${n} team rules for #repo/${shortRepo}.`, scopeId: `repo/${shortRepo}` });
    } else if (f.type === "approval" && m) {
      if (m.status !== "active") continue;
      const approver = f.id.startsWith("ev-") ? f.actor : null;
      put({ key: `approved:${m.id}`, kind: "approved", at: f.at, actor: approver ?? approverOf(m.scopeId), author: m.author, agent, memory: m, scopeId: m.scopeId, line: `"${plain(m.title)}". Every agent now knows it.`, meta: `approved by ${handle(approver ?? approverOf(m.scopeId))} · ${provenance(m)}` });
    } else if (f.type === "rejection" && m) {
      put({ key: `rejected:${m.id}`, kind: "rejected", at: f.at, actor: f.actor, memory: m, scopeId: m.scopeId, line: `"${plain(m.title)}" was rejected.`, meta: provenance(m) });
    } else if (f.type === "blocked" && m) {
      const b = blockedBy(m, memById);
      put({ key: `blocked:${m.id}`, kind: "blocked", at: f.at, actor: m.author, agent, memory: m, block: b, scopeId: m.scopeId, line: `Contradicts @${b.owner}'s locked rule "${plain(b.title)}".`, meta: `${whose(m.author, agent, { suffix: " agent" })} proposed "${plain(m.title)}"${b.why ? ` · ${b.why}` : ""}` });
    } else if (f.type === "correction" && m && m.status === "pending") {
      const kind = m.source === "agent" ? "proposed" : "captured";
      put({ key: `pending:${m.id}`, kind, at: m.evidence?.[0]?.at ?? f.at, actor: m.author, agent, memory: m, scopeId: m.scopeId, line: `"${plain(m.title)}". Waiting on @${approverOf(m.scopeId) ?? "a lead"}.`, meta: provenance(m) });
    } else if ((f.type === "correction" || f.type === "review_comment") && !m && f.repo === shortRepo) {
      put({ key: f.id, kind: "correction", at: f.at, actor: f.actor, agent, line: `${handle(f.actor)} ${plain(f.text)}` });
    }
  }

  // Edits and collisions (activity rows are the last 30 min, newest first).
  const items = live.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.repo !== shortRepo) continue;
    if (it.warning) {
      const other = items.slice(i + 1).find((o) => o.file === it.file && o.repo === it.repo && o.sessionId !== it.sessionId);
      const who = other ? whose(other.actor, other.agent, { suffix: " agent" }) : "Another agent";
      put({
        key: `col:${it.id}`,
        kind: "collision",
        at: it.createdAt,
        actor: it.actor,
        agent: it.agent,
        file: it.file,
        other,
        line: (t) => `${who} edited ${it.file} ${other ? ago(other.createdAt, t) : "recently"}.`,
        meta: `${whose(it.actor, it.agent)} is in it now`,
      });
    }
    put({ key: `edit:${it.sessionId}:${it.file}`, kind: "edit", at: it.createdAt, actor: it.actor, agent: it.agent, file: it.file, line: `${whose(it.actor, it.agent)} edited ${it.file}` });
  }
  return [...cards.values()].sort((a, b) => at(b.at) - at(a.at));
}

/** ctx.api: everything a view needs from the server. `role` comes from state (people.role of --user). */
export function makeApi(cfg, getState) {
  const c = client(cfg);
  const repo = cfg.repo;
  const role = () => getState().role;
  return {
    raw: c,
    scopes: () => c.get("/api/scopes"), // { scopes, people }
    memories: (q = {}) => c.get(`/api/memories?${new URLSearchParams({ scope: repo, chain: "1", ...q })}`).then((r) => r.memories ?? []),
    live: () => c.get("/api/activity/live"),
    rules: (file = "") => c.get(`/api/vscode/rules?${new URLSearchParams({ repo, file, user: cfg.actor })}`),
    check: (file, text) => c.post("/api/vscode/check", { repo, file, text }, { timeout: 30000 }),
    approve: (id) => c.post(`/api/memories/${encodeURIComponent(id)}/approve`, {}, { role: role() }),
    reject: (id) => c.post(`/api/memories/${encodeURIComponent(id)}/reject`, {}, { role: role() }),
    /** A correction through the learning engine (same as `hivemind teach`). → { lessons, actions } */
    teach: (text) =>
      c.post("/api/events", { type: "correction", actor: cfg.actor, repo, sessionId: `watch-${Date.now()}`, payload: { text, via: "cli" } }, { timeout: 60000 }),
  };
}

/** A 403 as a plain sentence: "engineer alex cannot approve memories in team/data-pipelines" → "You can't approve … @jordan can." */
export function plainError(e, { scopes = [], scopeId } = {}) {
  const msg = String(e?.message ?? e);
  if (e?.status === 403 || /cannot|not allowed|forbidden/i.test(msg)) {
    const scope = msg.match(/in ([\w/-]+)/)?.[1] ?? scopeId;
    const owner = scope ? ownerOf(scope, scopes) : null;
    if (/locked/i.test(msg)) return "Only security can change a locked rule.";
    return `You can't approve lessons in #${scope ?? "this scope"}.${owner ? ` @${owner} can.` : ""}`;
  }
  if (/fetch failed|timeout|aborted|ENOTFOUND|ECONNREFUSED/i.test(msg)) return "Hivemind is offline. Retrying.";
  return msg.replace(/^HTTP \d+:?\s*/, "");
}
