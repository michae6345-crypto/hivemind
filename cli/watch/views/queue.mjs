// Queue (owner: I), role-aware. Leads and security: WAITING ON YOU (a approves, r rejects; the card flashes green and
// folds away, and if it was your own lesson the hex seal plays) plus STOPPED BY A LOCKED RULE. Engineers: YOUR LESSONS
// with where each one stands. j/k move, enter opens, p switches persona (alex, noor, jordan, maya) for the demo.
import { COLOR } from "../theme.mjs";
import { wrap } from "../term.mjs";
import {
  agentOf, allMemories, approval, approverOf, canDecide, isMine, origin, ownerHandle, plain403, quoteOf, ROLE,
  staleExtra, switchPersona,
} from "./rulekit.mjs";

const FLASH_MS = 320;
const FOLD_MS = 300;
const view = (state) => (state.view.queue ??= { index: 0, leaving: null, notes: {} });
const strike = (s) => (COLOR ? `\x1b[9m${s}\x1b[29m` : s);
const decider = (state) => state.role === "lead" || state.role === "security";

/** { sections: [{ key, title, cards: [{ m, act }] }], cards: flat selectable list } */
function model(state, ctx) {
  const chain = new Set(state.chain ?? []);
  const all = allMemories(state, ctx);
  const inChain = (m) => chain.has(m.scopeId) || m.scopeId === `personal/${state.actor}`;
  const newest = (a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt);
  const sections = [];
  if (decider(state)) {
    const pool = state.role === "security" ? all : all.filter(inChain);
    sections.push({ key: "you", title: "WAITING ON YOU", cards: pool.filter((m) => m.status === "pending" && canDecide(m, state)).sort(newest).map((m) => ({ m, act: true })) });
    const others = all.filter((m) => m.status === "pending" && inChain(m) && !canDecide(m, state)).sort(newest);
    if (others.length) sections.push({ key: "others", title: "WAITING ON SOMEONE ELSE", cards: others.map((m) => ({ m, act: false })) });
    sections.push({
      key: "blocked",
      title: "STOPPED BY A LOCKED RULE",
      cards: pool.filter((m) => m.status === "blocked").sort(newest).map((m) => ({ m, act: state.role === "security" })),
    });
  } else {
    const mine = all.filter((m) => isMine(m, state.actor) && m.kind !== "owner").sort(newest);
    sections.push({ key: "mine", title: "YOUR LESSONS", cards: mine.map((m) => ({ m, act: false })) });
  }
  return { sections, cards: sections.flatMap((s) => s.cards) };
}

function statusLine(m, state, ctx) {
  const { t } = ctx.theme;
  const th = ctx.theme;
  if (m.status === "pending") return `${t.lessonText("waiting on")} ${th.handleChip(approverOf(m.scopeId, state))}`;
  if (m.status === "blocked") return t.lockedText("blocked by a locked rule");
  if (m.status === "rejected") return t.muted("rejected");
  const a = approval(m);
  return a ? `${t.ok("live")}${t.faint(" · approved by ")}${th.handleChip(a.actor)}` : t.ok("live");
}

/** Lines for one card (bar added by the caller). */
function cardLines(m, act, state, ctx, w) {
  const th = ctx.theme;
  const { t } = th;
  const o = origin(m);
  const who = ownerHandle(m);
  const tool = th.toolName(agentOf(m, state));
  const when = relTime(o?.at ?? m.createdAt, ctx.now);
  const head = `${isMine(m, state.actor) ? t.text("you") : String(who).startsWith("agent") ? t.muted("an agent") : th.handleChip(who)}${tool ? " " + th.badge(tool) : ""}${t.faint(`  ${when}`)}`;
  const lines = [head];
  const title = th.rich(th.plain(m.title), { base: (s) => th.bold(t.text(s)) });
  lines.push(m.status === "blocked" || m.status === "rejected" ? strike(title) : title);
  const q = quoteOf(m);
  if (q) lines.push(...wrap(th.ital(t.muted(`"${th.plain(q)}"`)), w, 2));

  // scope + conflicts
  let conflict;
  if (m.status === "blocked") {
    const slug = String(m.blockedReason ?? "").match(/\[\[([^\]]+)\]\]/)?.[1];
    const rule = slug ? allMemories(state, ctx).find((x) => x.slug === slug) : null;
    conflict = rule ? `${t.lockedText("contradicts ")}${t.handle(`@${rule.author}`)}${t.lockedText(`'s "${th.plain(rule.title)}"`)}` : t.lockedText(th.plain(m.blockedReason ?? "contradicts a locked rule"));
  } else if (m.blockedReason) conflict = t.lockedText(`conflicts: ${th.plain(m.blockedReason)}`);
  else {
    const locked = (state.rules ?? []).filter((r) => r.locked).length;
    conflict = m.status !== "pending" ? "" : t.faint(locked ? `no conflict with the ${locked} locked rule${locked === 1 ? "" : "s"}` : "no conflict with locked rules");
  }
  lines.push(`${th.scopeChip(m.scopeId)}${conflict ? th.sep() + conflict : ""}`);
  if (m.status !== "blocked" && (!act || m.status !== "pending")) lines.push(statusLine(m, state, ctx));
  return lines;
}

function relTime(iso, now) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

async function decide(m, how, state, ctx) {
  const v = view(state);
  delete v.notes[m.id];
  try {
    const res = await ctx.actions.busy(how === "approve" ? "Approving" : "Rejecting", () =>
      how === "approve" ? ctx.api.approve(m.id) : ctx.api.reject(m.id),
    );
    v.leaving = { id: m.id, at: Date.now(), how };
    ctx.actions.animate(FLASH_MS + FOLD_MS + 100);
    const title = ctx.theme.plain(m.title);
    ctx.actions.toast(
      how === "approve" ? `Approved "${title}". Every agent on #${m.scopeId} gets it next session.` : `Rejected "${title}".`,
      how === "approve" ? "ok" : "muted",
      3500,
    );
    if (how === "approve" && isMine(m, state.actor)) ctx.actions.celebrate(res?.id ? res : { ...m, status: "active" });
    setTimeout(() => {
      v.leaving = null;
      staleExtra(state);
      ctx.actions.refresh();
    }, FLASH_MS + FOLD_MS + 50);
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
    if (decider(state)) return ms.filter((m) => m.status === "pending" && canDecide(m, state)).length || null;
    return ms.filter((m) => m.status === "pending" && isMine(m, state.actor)).length || null;
  },
  keys: (state) =>
    decider(state)
      ? [["j/k", "move"], ["a", "approve"], ["r", state.role === "security" ? "reject/dismiss" : "reject"], ["enter", "open"], ["p", "persona"]]
      : [["j/k", "move"], ["enter", "open"], ["p", "persona"]],

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const v = view(state);
    const { sections, cards } = model(state, ctx);
    v.index = Math.max(0, Math.min(v.index, cards.length - 1));
    const sel = cards[v.index]?.m;
    const persona = `${t.faint("viewing as ")}${th.handleChip(state.actor)}${t.faint(` ${ROLE[state.role] ?? state.role}  p switch `)}`;

    const out = [th.spread("", persona, w)];
    let selLine = 0;
    for (const s of sections) {
      if (!s.cards.length && s.key !== "you" && s.key !== "mine") continue;
      const tone = s.key === "blocked" ? th.label("blocked", s.title) : s.key === "you" ? th.label("you") : th.bold(t.muted(s.title));
      out.push(th.clip(` ${tone}${t.faint(` ${s.cards.length}`)}`, w));
      if (!s.cards.length) {
        out.push(th.clip(`   ${t.muted(s.key === "mine" ? "You haven't taught Hivemind anything yet. Press t, or correct an agent." : "Nothing waiting.")}`, w));
        if (s.key === "you") out.push(th.clip(`   ${t.faint("Every lesson has an owner's sign-off.")}`, w));
        out.push("");
        continue;
      }
      for (const { m, act } of s.cards) {
        const isSel = m === sel;
        const lv = v.leaving?.id === m.id ? v.leaving : null;
        const age = lv ? ctx.now - lv.at : 0;
        if (lv && age > FLASH_MS + FOLD_MS) continue;
        let lines = cardLines(m, act, state, ctx, w - 4);
        if (v.notes[m.id]) lines.push(t.lockedText(v.notes[m.id]));
        if (lv) {
          const word = lv.how === "approve" ? th.bold(t.ok("APPROVED")) : th.bold(t.muted("REJECTED"));
          lines = [word, ...lines.slice(1)];
          if (age > FLASH_MS) lines = lines.slice(0, Math.max(0, Math.round(lines.length * (1 - th.ease((age - FLASH_MS) / FOLD_MS)))));
        }
        const barCol = lv ? (lv.how === "approve" ? t.ok : t.faint) : isSel ? t.blue : m.status === "blocked" ? t.locked : m.status === "pending" ? t.lesson : t.hair;
        const bar = barCol(isSel || lv ? "┃" : "│");
        if (isSel) selLine = out.length;
        for (const l of lines) out.push(th.clip(` ${bar} ${l}`, w));
        if (lines.length) out.push("");
      }
    }
    const room = Math.max(3, ctx.height);
    const start = Math.max(0, Math.min(selLine - 1, out.length - room));
    return start ? [out[0], ...out.slice(start + 1, start + room)] : out.slice(0, room);
  },

  onKey(key, state, ctx) {
    const v = view(state);
    const { cards } = model(state, ctx);
    if (key.name === "j" || key.name === "down") return (v.index = Math.min(cards.length - 1, v.index + 1)), true;
    if (key.name === "k" || key.name === "up") return (v.index = Math.max(0, v.index - 1)), true;
    if (key.name === "p") return switchPersona(state, ctx), true;
    const c = cards[v.index];
    if (!c) return false;
    if (key.name === "return" || key.name === "enter") return ctx.actions.openDetail(c.m.id), true;
    if (key.name === "a" || key.name === "r") {
      if (v.leaving) return true;
      if (!decider(state)) {
        const msg = `You can't ${key.name === "a" ? "approve" : "reject"} lessons as an engineer. @${approverOf(c.m.scopeId, state)} decides.`;
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
