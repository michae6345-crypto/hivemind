// Shared by views/rules.mjs, views/detail.mjs and views/queue.mjs (owner: I): memory provenance, the persona switch,
// and the few things the shell doesn't poll (every status across scopes for "your lessons" / blocked, the personal
// layer, metrics for "reached N agents"), fetched lazily and cached in state.view._rk.
import { canApprove, chainOf, ownerOf } from "../data.mjs";

export const PERSONAS = ["alex", "noor", "jordan", "maya"];
export const ROLE = { security: "Security", lead: "Lead", engineer: "Engineer" };

const isApproval = (e) => e?.type === "manual" && /^Approved by /.test(e.quote ?? "");
/** First evidence that isn't an approval: the correction / review / note the rule came from. */
export const origin = (m) => (m?.evidence ?? []).find((e) => !isApproval(e)) ?? null;
/** Last "Approved by …" evidence: { actor, at }. */
export const approval = (m) => [...(m?.evidence ?? [])].reverse().find(isApproval) ?? null;
export const isAgentActor = (a) => !a || String(a).startsWith("agent");
/** The human behind a rule: the corrector / reviewer, else the author ("agent:…" stays an agent). */
export const ownerHandle = (m) => {
  const o = origin(m);
  return o && !isAgentActor(o.actor) ? o.actor : m?.author;
};
export const isMine = (m, me) => !!me && (m.author === me || origin(m)?.actor === me);
export const quoteOf = (m) => {
  const q = origin(m)?.quote ?? "";
  return q && !/^(Written|Proposed) by /.test(q) ? q : "";
};

const TEN_MIN = 10 * 60 * 1000;
/** Approved (or turned active) in the last 10 minutes: the green "new" dot. */
export function isNew(m, now) {
  if (m.status !== "active") return false;
  const a = approval(m);
  if (a) return now - Date.parse(a.at) < TEN_MIN;
  const changed = Date.parse(m.updatedAt) - Date.parse(m.createdAt) > 1000;
  return changed && m.source !== "human" && now - Date.parse(m.updatedAt) < TEN_MIN;
}

/** Which tool an agent used for this memory, from the live feed (memoryId → agent). */
export function agentOf(m, state) {
  for (const f of state.live?.feed ?? []) if (f.memoryId === m.id && f.agent) return f.agent;
  for (const c of state.cards ?? []) if (c.memory?.id === m.id && c.agent) return c.agent;
  return undefined;
}

export const approverOf = (scopeId, state) => ownerOf(scopeId, state.scopes) ?? "a lead";
/** canApprove with the shell's effective role (--role / persona switch). */
export const canDecide = (m, state) => canApprove(state.me ? { ...state.me, role: state.role } : null, m, state.scopes);

// ---------- time ----------
const fmt = (iso, o) => new Date(iso).toLocaleString("en-US", o);
/** "Oct 14, 3:12 PM" */
export const stamp = (iso) => fmt(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "3:20 PM" when it's the same day as `ref`, else the full stamp. */
export const stampAfter = (iso, ref) =>
  ref && new Date(iso).toDateString() === new Date(ref).toDateString() ? fmt(iso, { hour: "numeric", minute: "2-digit" }) : stamp(iso);

// ---------- lazily fetched extras ----------
const EXTRA_MS = 15000;
export function extra(state, ctx) {
  const x = (state.view._rk ??= { all: null, metrics: null, at: 0, loading: false });
  if (!x.loading && Date.now() - x.at > EXTRA_MS && ctx?.api?.raw) {
    x.loading = true;
    Promise.all([
      ctx.api.raw.get("/api/memories?status=pending,active,blocked,rejected").then((r) => r.memories ?? null, () => x.all),
      ctx.api.raw.get("/api/metrics").catch(() => x.metrics),
    ]).then(([all, metrics]) => {
      Object.assign(x, { all, metrics, at: Date.now(), loading: false });
      ctx.actions?.render?.();
    });
  }
  return x;
}
export const staleExtra = (state) => state.view._rk && (state.view._rk.at = 0);

/** Every memory a view may show: the repo chain (shell-polled) + extras (all statuses, every scope), deduped. */
export function allMemories(state, ctx) {
  const x = extra(state, ctx);
  const by = new Map();
  for (const m of x.all ?? []) by.set(m.id, m);
  for (const m of state.memories ?? []) by.set(m.id, m); // the 2s poll is fresher
  return [...by.values()];
}
export const findMemory = (key, state, ctx) => allMemories(state, ctx).find((m) => m.id === key || m.slug === key) ?? null;

/** People whose agents were served this lesson (metrics.transfer), newest first. */
export function reachOf(m, state, ctx) {
  const tr = extra(state, ctx).metrics?.transfer ?? [];
  return [...new Set(tr.filter((t) => t.lesson === m.slug).map((t) => t.to))];
}
/** Agent sessions working under this scope in the last 30 min (live activity): "in context (N agents)". */
export function inContext(m, state) {
  const short = String(state.repo ?? "").replace(/^repo\//, "");
  const repoScope = `repo/${short}`;
  const covers = m.scopeId === "org" || chainOf(repoScope, state.scopes).includes(m.scopeId);
  if (!covers) return 0;
  return new Set((state.live?.items ?? []).filter((i) => m.scopeId === "org" || i.repo === short).map((i) => i.sessionId)).size;
}

// ---------- 403s, in words ----------
export function plain403(e, m, state, ctx) {
  const msg = String(e?.message ?? e);
  const hit = msg.match(/cannot (approve|reject) memories in (\S+)/);
  if (hit) {
    const owner = ownerOf(hit[2], state.scopes);
    return `You can't ${hit[1]} lessons in #${hit[2]} as ${ROLE[state.role] ?? state.role}.${owner ? ` @${owner} can.` : ""}`;
  }
  if (/locked memories/.test(msg)) return "Only security can change a locked rule.";
  if (/^blocked:/.test(msg)) return "It contradicts a locked rule. Only security can let it through.";
  if (e?.status === 409) return msg.replace(/^memory is/, "That lesson is") + ".";
  return ctx.actions.plainError(e, m?.scopeId);
}

// ---------- persona switch (p) ----------
export function switchPersona(state, ctx) {
  const ids = PERSONAS.filter((id) => state.people.some((p) => p.id === id));
  if (!ids.length) return;
  const next = ids[(ids.indexOf(state.actor) + 1) % ids.length];
  const me = state.people.find((p) => p.id === next) ?? null;
  ctx.cfg.actor = next; // the API client reads cfg.actor for x-hm-user on every call
  if (ctx.cfg.flags) delete ctx.cfg.flags.role;
  Object.assign(state, { actor: next, me, role: me?.role ?? "engineer" });
  for (const k of ["rules", "queue", "detail"]) if (state.view[k]) state.view[k].index = 0;
  if (state.view.queue) state.view.queue.notes = {};
  staleExtra(state);
  ctx.actions.toast(`Viewing as @${next} (${ROLE[state.role] ?? state.role}).`, "muted", 2500);
  ctx.actions.refresh();
}
