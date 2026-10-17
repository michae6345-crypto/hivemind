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
  const a = approval(m); // only a real "Approved by" counts (a reseed also bumps updatedAt)
  return !!a && now - Date.parse(a.at) < TEN_MIN;
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

// ---------- atoms (public/brand/terminal/terminal-spec.md §2 + §4, lifted from tui-reference.mjs) ----------
export const C = {
  chipBg: "#2A2A2E",
  selBg: "#232A45", // chrome blue ~14% on #1C1C1E
  okBg: "#1D3A2B",
  hair: "#2E2E32",
  chrome: "#4C6EF5",
  chromeText: "#91A7FF",
  ok: "#3DD68C",
  team: "#8B93FF",
  repo: "#2DD4BF",
  org: "#E4E4E7",
  person: "#A1A1AA",
};

/** Theme-bound atoms for one render: chips, titles with code tokens, washes. */
export function atoms(state, ctx) {
  const th = ctx.theme;
  const { t } = th;
  const on = th.COLOR;
  const chipBg = (s) => th.bg(C.chipBg)(s);
  const ul = (s) => (on ? `\x1b[4m${s}\x1b[24m` : s);
  const layerOfPerson = (id) => {
    const r = state.people?.find((p) => p.id === id)?.role;
    return r === "security" ? C.org : r === "lead" ? C.team : C.repo;
  };
  const scopeDot = (id) => (id === "org" ? C.org : id.startsWith("team/") ? C.team : id.startsWith("repo/") ? C.repo : C.person);
  /** ` ● #repo/export-service ` (your personal scope: ` ○ #you `). */
  const scope = (id) => {
    const mine = id === `personal/${state.actor}`;
    const label = mine ? "#you" : id === "org" ? "#org" : `#${id}`;
    return chipBg(` ${th.fg(scopeDot(id))(id.startsWith("personal/") ? "○" : "●")} ${t.text(label)} `);
  };
  /** ` ● @jordan ` with the person's layer dot; possessive inside the chip: ` ● @alex's `. Agents: plain "an agent". */
  const handle = (id, { pos = false } = {}) => {
    const h = String(id ?? "").replace(/^@/, "");
    if (!h || isAgentActor(h)) return t.muted(pos ? "an agent's" : "an agent");
    return chipBg(` ${th.fg(layerOfPerson(h))("●")} ${t.text(`@${h}${pos ? "'s" : ""}`)} `);
  };
  /** Title in bold text; `code` and the rule's symbols underlined in the rule's colour. */
  const title = (m, { bold = true, base } = {}) => {
    const tone = m.locked ? t.lockedText : t.lessonText;
    const syms = [...(m.symbols ?? []), ...(String(m.body ?? "").match(/`([^`(]+)/g) ?? []).map((x) => x.slice(1))].filter((x) => x.length > 2);
    const txt = base ?? ((s) => (bold ? th.bold(t.text(s)) : t.text(s)));
    const plainTitle = th.plain(m.title).replace(/`/g, "");
    if (!syms.length) return txt(plainTitle);
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`((?:${syms.map(esc).join("|")})(?:\\(\\))?)`, "g");
    return plainTitle
      .split(re)
      .map((part, i) => (i % 2 ? ul(tone(part)) : part ? txt(part) : ""))
      .join("");
  };
  /** Paint a whole row on a solid wash (chips' own bg resets are re-opened so the wash survives them). */
  const wash = (line, hex, w) => {
    if (!on || !hex) return th.fit(line, w);
    const open = th.bg(hex)("").replace("\x1b[49m", "");
    const body = th.fit(line, w).replace(/\x1b\[49m/g, "\x1b[49m" + open).replace(/\x1b\[0m/g, "\x1b[0m" + open);
    return open + body + "\x1b[49m";
  };
  const section = (label, n, scopeText) =>
    th.bold(t.faint(label)) + (scopeText ? t.faint(" · ") + t.faint(scopeText) : "") + t.faint(" · ") + t.faint(String(n));
  const day = shortDay;
  return { scope, handle, title, wash, section, day, ul, chrome: th.fg(C.chrome), chromeText: th.fg(C.chromeText), ok: th.fg(C.ok), hair: th.fg(C.hair) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14 Oct" */
export const shortDay = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** "2m" / "3h" / "4d" / "14 Oct". */
export function age(iso, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)}d`;
  return shortDay(iso);
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
