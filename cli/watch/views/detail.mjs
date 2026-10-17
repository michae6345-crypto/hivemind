// Rule detail (owner: I): one rule over the current tab, provenance first. Kind label, title, rule text, a facts row,
// then the timeline of how it got here (correction → proposed → approved → reached) or, for locked rules,
// set → locked → blocked N lessons → reaches every agent. Then where it's broken right now. esc goes back (shell).
import { wrap } from "../term.mjs";
import {
  agentOf, allMemories, approval, approverOf, canDecide, findMemory, inContext, isAgentActor, origin, ownerHandle,
  quoteOf, reachOf, ROLE, stamp, stampAfter,
} from "./rulekit.mjs";

const view = (state) => (state.view.detail ??= { index: 0, scroll: 0, key: null });

/** A VsRule from /api/vscode/rules shaped like a memory (when the rule isn't in the polled memories). */
function fromVsRule(r) {
  const via = r.learnedVia;
  const type = { correction: "correction", review: "review_comment", agent: "agent" }[via?.kind] ?? "manual";
  const quote = String(r.learnedFrom ?? "").match(/"(.+)"/)?.[1] ?? "";
  return {
    id: r.id, slug: r.slug, title: r.title, body: r.summary, scopeId: r.scopeId, kind: r.kind, locked: r.locked,
    status: r.status, author: r.ownerId, source: "human", createdAt: r.taughtAt, updatedAt: r.taughtAt,
    evidence: via ? [{ type, actor: String(via.by).replace(/^@/, ""), at: via.at, quote }] : [],
  };
}

function kindLabel(m, th) {
  if (m.status === "blocked") return th.label("blocked", "BLOCKED LESSON");
  if (m.locked) return th.label("locked");
  if (m.status === "pending") return th.label("captured", "PROPOSED LESSON");
  if (m.status === "rejected") return th.label("rejected", "REJECTED LESSON");
  if (m.kind === "owner") return th.label("fact", "OWNER");
  if (m.kind === "fact") return th.label("fact");
  const layer = m.scopeId === "org" ? "ORG" : m.scopeId.startsWith("repo/") ? "REPO" : m.scopeId.startsWith("personal/") ? "YOUR" : "TEAM";
  return th.label("lesson", `${layer} LESSON`);
}

/** Timeline steps: { dot, text, sub?: string[], tone } top to bottom. */
function timeline(m, state, ctx) {
  const th = ctx.theme;
  const { t } = th;
  const h = (id) => t.handle(`@${String(id).replace(/^@/, "")}`); // plain handle in sentences (chips carry their own dot)
  const steps = [];
  const o = origin(m);
  const a = approval(m);
  const tool = th.toolName(agentOf(m, state));
  const q = quoteOf(m);
  const quoteLines = q ? wrap(th.ital(t.muted(`"${th.plain(q)}"`)), ctx.width - 10, 3) : [];

  if (m.locked) {
    const p = state.people.find((x) => x.id === m.author);
    steps.push({ tone: "locked", text: `Set by ${h(m.author)}${p ? th.sep() + t.muted(p.title) : ""}${th.sep()}${t.muted(stamp(o?.at ?? m.createdAt))}`, sub: quoteLines });
    steps.push({ tone: "locked", text: `${th.bold(t.locked("Locked"))}${t.muted(" · applies to ")}${th.scopeChip(m.scopeId)}${t.muted(m.scopeId === "org" ? " and everything below it" : " and below")}` });
    const blocked = allMemories(state, ctx).filter((x) => x.status === "blocked" && String(x.blockedReason ?? "").includes(`[[${m.slug}]]`));
    steps.push({
      tone: blocked.length ? "locked" : "muted",
      text: blocked.length ? t.lockedText(`Blocked ${blocked.length} lesson${blocked.length > 1 ? "s" : ""}`) : t.muted("Hasn't had to block a lesson yet"),
      sub: blocked.slice(0, 3).map((x) => t.faint(`"${th.plain(x.title)}"`) + t.faint(` · @${ownerHandle(x)}`)),
    });
    steps.push({ tone: "text", text: `${t.text("Reaches every agent")}  ${th.TOOLS.slice(0, 5).map(th.badge).join(" ")}` });
    return steps;
  }

  // where it came from
  if (o?.type === "correction")
    steps.push({ tone: "lesson", text: `${h(o.actor)} ${t.text(`corrected ${tool || "an agent"}`)}${th.sep()}${t.muted(stamp(o.at))}`, sub: quoteLines });
  else if (o?.type === "review_comment")
    steps.push({ tone: "lesson", text: `${h(o.actor)} ${t.text("left a review comment")}${th.sep()}${t.muted(stamp(o.at))}`, sub: quoteLines });
  else if (o?.type === "agent")
    steps.push({ tone: "lesson", text: `${t.text(`${tool ? `A ${tool} agent` : "An agent"} proposed it`)}${th.sep()}${t.muted(stamp(o.at))}`, sub: quoteLines });
  else steps.push({ tone: "text", text: `${h(isAgentActor(m.author) ? "agent" : m.author)} ${t.text("wrote it")}${th.sep()}${t.muted(stamp(o?.at ?? m.createdAt))}`, sub: quoteLines.length ? quoteLines : [] });

  if (o && o.type !== "manual")
    steps.push({ tone: "lesson", text: `${t.text("Hivemind proposed it as a lesson for ")}${th.scopeChip(m.scopeId)}${th.sep()}${t.muted(stampAfter(m.createdAt, o.at))}` });

  // the decision
  if (m.status === "pending") {
    const who = approverOf(m.scopeId, state);
    steps.push({ tone: "wait", text: `${t.lessonText("Waiting on ")}${h(who)}${canDecide(m, state) ? t.faint("  (that's you: a approves, r rejects)") : ""}` });
    return steps;
  }
  if (m.status === "blocked") {
    const slug = String(m.blockedReason ?? "").match(/\[\[([^\]]+)\]\]/)?.[1];
    const rule = slug ? findMemory(slug, state, ctx) : null;
    const why = th.plain(String(m.blockedReason ?? "").split(/\):\s*/)[1] ?? "");
    steps.push({
      tone: "locked",
      text: `${t.lockedText("Blocked by ")}${rule ? h(rule.author) + t.lockedText(`'s locked rule "${th.plain(rule.title)}"`) : t.lockedText("a locked rule")}`,
      sub: why ? [t.faint(why)] : [],
    });
    steps.push({ tone: "muted", text: t.muted("Never sent to agents") });
    return steps;
  }
  if (m.status === "rejected") {
    steps.push({ tone: "muted", text: t.muted(`Rejected${th.sep()}${stampAfter(m.updatedAt, m.createdAt)}`) });
    return steps;
  }
  if (a) steps.push({ tone: "ok", text: `${h(a.actor)} ${t.ok("approved")}${th.sep()}${t.ok(stampAfter(a.at, o?.at ?? m.createdAt))}` });

  // who has it
  const reach = reachOf(m, state, ctx).filter((p) => p !== ownerHandle(m));
  const badges = th.TOOLS.slice(0, 5).map(th.badge).join(" ");
  steps.push(
    reach.length
      ? { tone: "text", text: `${t.text(`Reached ${reach.length} agent${reach.length > 1 ? "s" : ""}`)}  ${badges}`, sub: [reach.slice(0, 6).map(h).join(" ")] }
      : { tone: "text", text: `${t.text("In every agent's next session")}  ${badges}` },
  );
  return steps;
}

export default {
  id: "detail",
  title: "Rule",
  keys: (state) => {
    const m = state.detail ? (state.memories ?? []).find((x) => x.id === state.detail || x.slug === state.detail) : null;
    const decide = m && m.status === "pending" ? [["a", "approve"], ["r", "reject"]] : [];
    return [["esc", "back"], ["j/k", "scroll"], ...decide];
  },

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const v = view(state);
    if (v.key !== state.detail) Object.assign(v, { key: state.detail, scroll: 0 });
    const vs = (state.rules ?? []).find((r) => r.id === state.detail || r.slug === state.detail);
    const m = findMemory(state.detail, state, ctx) ?? (vs ? fromVsRule(vs) : null);
    const out = ["", th.clip(`  ${t.faint("‹ esc back")}`, w), ""];
    if (!m) return [...out, th.clip(`  ${t.muted("This rule isn't in Hivemind anymore.")}`, w)];

    const pad = "  ";
    // kind · scope, title, rule text
    out.push(th.clip(`${pad}${kindLabel(m, th)}${th.sep()}${th.scopeChip(m.scopeId)}`, w));
    out.push(th.clip(`${pad}${th.bold(th.rich(th.plain(m.title), { locked: m.locked }))}`, w));
    const body = th.plain(String(m.body ?? "").replace(/\*\*/g, "").replace(/\s*\n+\s*/g, " "));
    if (body && body !== th.plain(m.title)) for (const l of wrap(th.rich(body, { locked: m.locked, base: t.muted }), w - 4, 4)) out.push(pad + l);
    out.push("");

    // facts: scope · owner · status · in context (N agents)
    const owner = ownerHandle(m);
    const status =
      m.status === "active" ? (m.locked ? t.locked("locked") : t.ok("active")) : m.status === "pending" ? t.lessonText("waiting") : m.status === "blocked" ? t.lockedText("blocked") : t.muted(m.status);
    const n = inContext(m, state);
    const ctxWord = m.status !== "active" ? t.faint("not in context") : t.muted(n ? `in context (${n} agent${n > 1 ? "s" : ""})` : "in context (no agents running)");
    const p = state.people.find((x) => x.id === owner);
    out.push(
      th.clip(
        `${pad}${th.scopeChip(m.scopeId)}${th.sep()}${isAgentActor(owner) ? t.muted("an agent") : th.handleChip(owner)}${p ? t.faint(` ${ROLE[p.role]}`) : ""}${th.sep()}${status}${th.sep()}${ctxWord}`,
        w,
      ),
    );
    out.push("");

    // the timeline (hero)
    out.push(th.clip(`${pad}${th.bold(t.faint("HOW IT GOT HERE"))}`, w));
    const steps = timeline(m, state, ctx);
    const dotFor = { ok: t.ok("●"), locked: t.locked("●"), lesson: t.lesson("●"), wait: t.lesson("○"), muted: t.faint("●"), text: t.text("●") };
    steps.forEach((s, i) => {
      const last = i === steps.length - 1;
      out.push(th.clip(`${pad}${dotFor[s.tone] ?? t.text("●")} ${s.text}`, w));
      const rail = last ? " " : t.hair("│");
      for (const l of s.sub ?? []) out.push(th.clip(`${pad}${rail}   ${l}`, w));
      if (!last) out.push(`${pad}${rail}`);
    });
    out.push("");

    // broken right now (from the watcher's flags)
    const hits = [];
    for (const [file, list] of Object.entries(state.flags ?? {}))
      for (const f of list ?? []) if (f.ruleId === m.id) hits.push({ file, f, text: (state.files?.[file]?.text ?? "").split(/\r?\n/)[f.startLine] ?? "" });
    if (hits.length) {
      out.push(th.clip(`${pad}${th.bold(t.lockedText("BROKEN RIGHT NOW"))}${t.faint(` ${hits.length}`)}`, w));
      for (const { file, f, text } of hits.slice(0, 6)) {
        const where = (m.locked ? t.locked : t.lesson)(`${file}:${f.startLine + 1}`);
        out.push(th.clip(`${pad}${where}  ${t.muted(text.trim())}`, w));
      }
    } else if (m.status === "active") out.push(th.clip(`${pad}${t.faint("Nothing breaks it in the files you've changed.")}`, w));

    // scroll
    const room = Math.max(3, ctx.height);
    v.scroll = Math.max(0, Math.min(v.scroll, out.length - room));
    return out.slice(v.scroll, v.scroll + room);
  },

  onKey(key, state, ctx) {
    const v = view(state);
    if (key.name === "j" || key.name === "down") return (v.scroll += 1), true;
    if (key.name === "k" || key.name === "up") return (v.scroll = Math.max(0, v.scroll - 1)), true;
    const m = findMemory(state.detail, state, ctx);
    if (m && m.status === "pending" && (key.name === "a" || key.name === "r")) {
      (key.name === "a" ? ctx.actions.approve : ctx.actions.reject)(m);
      return true;
    }
    return false;
  },
};
