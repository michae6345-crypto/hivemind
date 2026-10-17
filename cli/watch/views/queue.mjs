// Queue (owner: I), role-aware, public/brand/terminal/terminal-spec.md "Queue (lead / engineer)".
// Leads and security: WAITING ON YOU cards (title, quote, scope + age, "proposed by @kevin's Claude Code agent", a
// conflicts line, then `a approve   r reject`), WAITING ON SOMEONE ELSE, and STOPPED BY A LOCKED RULE. On approve the
// card's wash goes green ("Approved · in every agent's next session") for ~600 ms, then it's removed; if the lesson was
// yours the hex seal plays. Engineers: YOUR LESSONS with where each stands, then what's waiting on a lead.
// 403s become plain sentences. j/k move · a/r decide · enter opens · p switches persona (kevin, emily, ben, greg).
import { wrap } from "../term.mjs";
import { blockingRule } from "../why.mjs";
import {
  age, agentOf, allMemories, approval, approverOf, atoms, C, canDecide, isMine, origin, ownerHandle, plain403,
  quoteOf, staleExtra, switchPersona,
} from "./rulekit.mjs";

const FLASH_MS = 600;
const view = (state) => (state.view.queue ??= { index: 0, leaving: null, notes: {} });
const decider = (state) => state.role === "lead" || state.role === "security";

/** Sections of cards; `act` = this person can approve/reject it here. */
function model(state, ctx) {
  const chain = new Set(state.chain ?? []);
  const all = allMemories(state, ctx);
  const inChain = (m) => chain.has(m.scopeId) || m.scopeId === `personal/${state.actor}`;
  const newest = (a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt);
  const pool = state.role === "security" ? all : all.filter(inChain);
  const sections = [];
  if (decider(state)) {
    sections.push({ key: "you", title: "WAITING ON YOU", cards: pool.filter((m) => m.status === "pending" && canDecide(m, state)).sort(newest).map((m) => ({ m, act: true })) });
    const others = pool.filter((m) => m.status === "pending" && !canDecide(m, state)).sort(newest);
    if (others.length) sections.push({ key: "others", title: "WAITING ON SOMEONE ELSE", cards: others.map((m) => ({ m, act: false })) });
  } else {
    const mine = all.filter((m) => isMine(m, state.actor) && m.kind !== "owner" && m.status !== "blocked").sort(newest);
    sections.push({ key: "mine", title: "YOUR LESSONS", cards: mine.map((m) => ({ m, act: false })) });
    const waiting = pool.filter((m) => m.status === "pending" && !isMine(m, state.actor)).sort(newest);
    if (waiting.length) sections.push({ key: "lead", title: "WAITING ON A LEAD", cards: waiting.map((m) => ({ m, act: false })) });
  }
  sections.push({
    key: "blocked",
    title: "STOPPED BY A LOCKED RULE",
    cards: pool.filter((m) => m.status === "blocked").sort(newest).map((m) => ({ m, act: state.role === "security" })),
  });
  return { sections, cards: sections.flatMap((s) => s.cards) };
}

/** "@kevin's Claude Code agent" / "you" / "an agent"; the tool is plain faint text (spec §4). */
function proposer(m, state, ctx, a) {
  const { t } = ctx.theme;
  const tool = ctx.theme.toolName(agentOf(m, state));
  const who = ownerHandle(m);
  if (who === state.actor) return t.text("you") + (tool ? t.faint(` via ${tool}`) : "");
  if (!who || String(who).startsWith("agent")) return t.muted(tool ? `a ${tool} agent` : "an agent");
  return `${a.handle(who, { pos: !!tool })}${tool ? t.faint(` ${tool} agent`) : ""}`;
}

/** Lines of one card (without the left rule). */
function card(m, act, state, ctx, a, w, flash) {
  const th = ctx.theme;
  const { t } = th;
  const o = origin(m);
  const lines = [];
  if (m.status === "blocked") {
    lines.push(a.title(m, { base: (s) => th.bold(t.muted(s)) }));
    const rule = blockingRule(m, allMemories(state, ctx));
    lines.push(
      rule
        ? `${t.lockedText("Blocked: contradicts ")}${a.handle(rule.author, { pos: true })}${t.lockedText(" locked rule")}`
        : t.lockedText(`Blocked: ${th.plain(m.blockedReason ?? "contradicts a locked rule")}`),
    );
    lines.push(`${t.faint("from ")}${proposer(m, state, ctx, a)}${t.faint(`  ${age(o?.at ?? m.createdAt, ctx.now)}`)}`);
    if (flash) lines.push(th.bold(t.muted(flash === "approve" ? "Let through" : "Dismissed")));
    else lines.push(act ? `${a.chromeText("a")}${t.faint(" let it through   ")}${a.chromeText("r")}${t.faint(" dismiss")}` : t.faint("only security can let it through"));
    return lines;
  }
  lines.push(a.title(m));
  const q = quoteOf(m);
  if (q) lines.push(...wrap(t.muted(`"${th.plain(q)}"`), w - 2, 2));
  lines.push(`${a.scope(m.scopeId)}${t.faint(`  ${age(o?.at ?? m.createdAt, ctx.now)}`)}`);
  lines.push(`${t.faint("proposed by ")}${proposer(m, state, ctx, a)}`);
  if (m.status === "pending") {
    const locked = (state.rules ?? []).filter((r) => r.locked).length;
    lines.push(
      m.blockedReason
        ? t.lockedText(`conflicts: ${th.plain(m.blockedReason)}`)
        : t.faint(locked ? `no conflict with the ${locked} locked rule${locked === 1 ? "" : "s"}` : "no conflict with a locked rule"),
    );
  }
  if (flash) lines.push(flash === "approve" ? `${th.bold(a.ok("Approved"))}${a.ok(" · in every agent's next session")}` : th.bold(t.muted("Rejected")));
  else if (m.status === "pending")
    lines.push(act ? `${a.chromeText("a")}${t.faint(" approve   ")}${a.chromeText("r")}${t.faint(" reject")}` : `${t.faint("Waiting on ")}${a.handle(approverOf(m.scopeId, state))}`);
  else if (m.status === "active") {
    const ap = approval(m);
    lines.push(`${a.ok("Live")}${ap ? `${t.faint(" · approved by ")}${a.handle(ap.actor)}` : ""}${t.faint(" · in every agent's context")}`);
  } else if (m.status === "rejected") lines.push(t.muted("Rejected"));
  return lines;
}

async function decide(m, how, state, ctx) {
  const v = view(state);
  delete v.notes[m.id];
  try {
    const res = await ctx.actions.busy(how === "approve" ? "Approving" : "Rejecting", () => (how === "approve" ? ctx.api.approve(m.id) : ctx.api.reject(m.id)));
    v.leaving = { id: m.id, at: Date.now(), how };
    ctx.actions.animate(FLASH_MS + 100);
    if (how === "approve" && isMine(m, state.actor)) ctx.actions.celebrate(res?.id ? res : { ...m, status: "active" });
    setTimeout(() => {
      v.leaving = null;
      staleExtra(state);
      ctx.actions.refresh();
    }, FLASH_MS);
  } catch (e) {
    const msg = plain403(e, m, state, ctx);
    v.notes[m.id] = msg;
    ctx.actions.toast(msg, "locked", 5000);
  }
}

export default {
  id: "queue",
  title: "Queue",
  count: (state) => {
    const ms = state.memories ?? [];
    return (decider(state) ? ms.filter((m) => m.status === "pending" && canDecide(m, state)) : ms.filter((m) => m.status === "pending")).length || null;
  },
  keys: (state) =>
    decider(state)
      ? [["a", "approve"], ["r", "reject"], ["j/k", "move"], ["enter", "open"], ["p", "persona"]]
      : [["j/k", "move"], ["enter", "open"], ["p", "persona"]],

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const a = atoms(state, ctx);
    const v = view(state);
    const { sections, cards } = model(state, ctx);
    if (v.leaving && ctx.now - v.leaving.at > FLASH_MS) v.leaving = null;
    v.index = Math.max(0, Math.min(v.index, cards.length - 1));
    const sel = cards[v.index]?.m;

    const out = [];
    let selFrom = 0;
    let selTo = 0;
    for (const s of sections) {
      if (!s.cards.length && s.key !== "you" && s.key !== "mine") continue;
      if (out.length) out.push("");
      out.push(a.section(s.title, s.cards.length));
      out.push("");
      if (!s.cards.length) {
        out.push(t.muted(s.key === "mine" ? "You haven't taught Hivemind anything yet." : "Nothing waiting."));
        out.push(t.faint(s.key === "mine" ? "Correct an agent, or press t." : "Every lesson has an owner's sign-off."));
        continue;
      }
      s.cards.forEach(({ m, act }, i) => {
        const flash = v.leaving?.id === m.id ? v.leaving.how : null;
        const isSel = m === sel && !flash;
        const bg = flash === "approve" ? C.okBg : isSel ? C.selBg : null;
        const rule = flash === "approve" ? a.ok("▎ ") : isSel ? a.chrome("▎ ") : m.status === "blocked" || m.locked ? t.locked("▎ ") : t.lesson("▎ ");
        const lines = card(m, act, state, ctx, a, w, flash);
        if (v.notes[m.id]) lines.push(t.lockedText(v.notes[m.id]));
        if (isSel) selFrom = out.length;
        const at = cards.findIndex((c) => c.m === m);
        lines.forEach((l, j) => out.push((j === 0 ? th.rowMark(at) : "") + a.wash((j === 0 ? rule : "  ") + l, bg, w)));
        if (isSel) selTo = out.length;
        if (i < s.cards.length - 1) out.push("");
      });
    }
    const room = Math.max(3, ctx.height);
    const start = selTo > room ? Math.min(selFrom - 2, out.length - room) : 0;
    return out.slice(Math.max(0, start), Math.max(0, start) + room).map((l) => th.clip(l, w));
  },

  /** Mouse: cards in render order (the same list j/k walks). */
  select(i, state) {
    view(state).index = i;
  },
  selected: (state) => view(state).index,
  onKey(key, state, ctx) {
    const v = view(state);
    const { cards } = model(state, ctx);
    if (key.name === "j" || key.name === "down") return (v.index = Math.min(cards.length - 1, v.index + 1)), true;
    if (key.name === "k" || key.name === "up") return (v.index = Math.max(0, v.index - 1)), true;
    if (key.name === "p") return switchPersona(state, ctx), true;
    const c = cards[v.index];
    if (!c) return false;
    if (key.name === "return" || key.name === "enter") {
      (state.view.detail ??= {}).from = "Queue";
      ctx.actions.openDetail(c.m.id);
      return true;
    }
    if (key.name === "a" || key.name === "r") {
      if (v.leaving) return true;
      if (!decider(state)) {
        const msg = `Engineers can't ${key.name === "a" ? "approve" : "reject"} lessons. @${approverOf(c.m.scopeId, state)} decides this one.`;
        v.notes[c.m.id] = msg;
        ctx.actions.toast(msg, "locked", 4000);
        return true;
      }
      void decide(c.m, key.name === "a" ? "approve" : "reject", state, ctx);
      return true;
    }
    return false;
  },
};
