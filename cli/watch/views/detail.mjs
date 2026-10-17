// Rule detail (owner: I), public/brand/terminal/terminal-spec.md "Rule detail": replaces the hover card, esc goes
// back. Kind label + scope chip, title, rule text, then the provenance timeline as the hero:
//   ○ 14 Oct  @kevin corrected Claude Code: "…"  →  ○ Hivemind proposed it as a lesson for #…  →  ● @ben approved it
//   →  ● now  in every agent's context · reached N agents
// Locked rules: ○ Set by @greg → ● Locked → ● Blocked N lessons → ● now in every agent's context.
// Then the facts (scope · owner · status · in context · related · broken right now).
import { wrap } from "../term.mjs";
import { linkFile } from "../git.mjs";
import { blocks, blockingRule, whyFacts, whyLines } from "../why.mjs";
import {
  age, agentOf, allMemories, approval, approverOf, atoms, canDecide, findMemory, inContext, isAgentActor, origin,
  ownerHandle, quoteOf, reachOf, ROLE,
} from "./rulekit.mjs";

const view = (state) => (state.view.detail ??= { scroll: 0, key: null, from: null });

/** A VsRule from /api/vscode/rules shaped like a memory (when the rule isn't in the polled memories). */
function fromVsRule(r) {
  const via = r.learnedVia;
  const type = { correction: "correction", review: "review_comment", agent: "agent" }[via?.kind] ?? "manual";
  const quote = String(r.learnedFrom ?? "").match(/"(.+)"/)?.[1] ?? "";
  return {
    id: r.id, slug: r.slug, title: r.title, body: r.summary, scopeId: r.scopeId, kind: r.kind, locked: r.locked,
    status: r.status, author: r.ownerId, source: "human", createdAt: r.taughtAt, updatedAt: r.taughtAt, symbols: r.symbols,
    evidence: via ? [{ type, actor: String(via.by).replace(/^@/, ""), at: via.at, quote }] : [],
  };
}

function kindWord(m) {
  if (m.status === "blocked") return ["BLOCKED LESSON", "locked"];
  if (m.locked) return ["LOCKED RULE", "locked"];
  if (m.status === "pending") return ["PROPOSED LESSON", "lesson"];
  if (m.status === "rejected") return ["REJECTED LESSON", "muted"];
  if (m.kind === "owner") return ["OWNER", "muted"];
  if (m.kind === "fact") return ["FACT", "muted"];
  const layer = m.scopeId === "org" ? "ORG" : m.scopeId.startsWith("repo/") ? "REPO" : m.scopeId.startsWith("personal/") ? "YOUR" : "TEAM";
  return [`${layer} LESSON`, "lesson"];
}

/** Timeline nodes: { dot: "○"|"●", tone, when, body, quote? } top to bottom. */
function timeline(m, state, ctx, a) {
  const th = ctx.theme;
  const { t } = th;
  const nodes = [];
  const o = origin(m);
  const ap = approval(m);
  const tool = th.toolName(agentOf(m, state));
  const q = quoteOf(m);
  const when = (iso) => a.day(iso);

  if (m.locked) {
    const p = state.people.find((x) => x.id === m.author);
    nodes.push({ dot: "○", tone: "muted", when: when(o?.at ?? m.createdAt), body: `${t.muted("Set by ")}${a.handle(m.author)}${p ? t.faint(` ${p.title}`) : ""}`, quote: q });
    nodes.push({ dot: "●", tone: "locked", when: when(o?.at ?? m.createdAt), body: `${th.bold(t.lockedText("Locked"))}${t.muted(" · applies to ")}${t.text(m.scopeId === "org" ? "#org and everything below it" : `#${m.scopeId} and below`)}` });
    const blocked = allMemories(state, ctx).filter((x) => x.status === "blocked" && blocks(x, m));
    if (blocked.length)
      nodes.push({
        dot: "●",
        tone: "locked",
        when: when(blocked[0].updatedAt ?? blocked[0].createdAt),
        body: t.lockedText(`Blocked ${blocked.length} lesson${blocked.length > 1 ? "s" : ""}`),
        lines: blocked.slice(0, 3).map((x) => `${t.faint('"')}${t.muted(th.plain(x.title))}${t.faint('"')}  ${a.handle(ownerHandle(x))}`),
      });
    nodes.push({ dot: "●", tone: "lesson", when: "now", body: t.text(`in every agent's context on #${m.scopeId}`), lines: [t.faint(th.TOOLS.slice(0, 5).join(" · "))] });
    return nodes;
  }

  // where it came from
  if (o?.type === "correction") nodes.push({ dot: "○", tone: "muted", when: when(o.at), body: `${a.handle(o.actor)} ${t.muted(`corrected ${tool || "an agent"}:`)}`, quote: q });
  else if (o?.type === "review_comment") nodes.push({ dot: "○", tone: "muted", when: when(o.at), body: `${a.handle(o.actor)} ${t.muted("left a review comment:")}`, quote: q });
  else if (o?.type === "agent") nodes.push({ dot: "○", tone: "muted", when: when(o.at), body: t.muted(`${tool ? `a ${tool} agent` : "an agent"} proposed it:`), quote: q });
  else nodes.push({ dot: "○", tone: "muted", when: when(o?.at ?? m.createdAt), body: `${a.handle(isAgentActor(m.author) ? "agent" : m.author)} ${t.muted("wrote it")}`, quote: q });

  const scopeText = t.text(`#${m.scopeId}`);
  if (m.status === "pending") {
    nodes.push({
      dot: "○",
      tone: "lesson",
      when: when(m.createdAt),
      body: `${t.muted("Hivemind proposed it for ")}${scopeText}`,
      lines: [
        `${t.faint("waiting on ")}${a.handle(approverOf(m.scopeId, state))}`,
        ...(canDecide(m, state) ? [`${a.chromeText("a")}${t.faint(" approve   ")}${a.chromeText("r")}${t.faint(" reject")}`] : []),
      ],
    });
    return nodes;
  }
  if (o && o.type !== "manual") nodes.push({ dot: "○", tone: "muted", when: when(m.createdAt), body: `${t.muted("Hivemind proposed it for ")}${scopeText}` });

  if (m.status === "blocked") {
    const rule = blockingRule(m, allMemories(state, ctx));
    const why = th.plain(String(m.blockedReason ?? "").split(/\):\s*/)[1] ?? "");
    nodes.push({
      dot: "●",
      tone: "locked",
      when: when(m.updatedAt ?? m.createdAt),
      body: rule ? `${t.lockedText("Blocked: contradicts ")}${a.handle(rule.author, { pos: true })}${t.lockedText(` locked rule "${th.plain(rule.title)}"`)}` : t.lockedText("Blocked by a locked rule"),
      lines: why ? [t.faint(why)] : [],
    });
    nodes.push({ dot: "○", tone: "muted", when: "", body: t.faint("never sent to agents") });
    return nodes;
  }
  if (m.status === "rejected") {
    nodes.push({ dot: "○", tone: "muted", when: when(m.updatedAt), body: t.muted("rejected; agents never got it") });
    return nodes;
  }
  if (ap) nodes.push({ dot: "●", tone: "ok", when: when(ap.at), body: `${a.handle(ap.actor)} ${a.ok("approved it")}` });

  const reach = reachOf(m, state, ctx).filter((p) => p !== ownerHandle(m));
  nodes.push({
    dot: "●",
    tone: "lesson",
    when: "now",
    body: `${t.text(`in every agent's context on #${m.scopeId}`)}${reach.length ? t.muted(` · reached ${reach.length} agent${reach.length > 1 ? "s" : ""}`) : ""}`,
    lines: [
      ...(reach.length ? [reach.slice(0, 5).map((h) => a.handle(h)).join(" ")] : []),
      t.faint(th.TOOLS.slice(0, 5).join(" · ")),
    ],
  });
  return nodes;
}

export default {
  id: "detail",
  title: "Rule",
  keys: (state) => {
    const m = (state.memories ?? []).find((x) => x.id === state.detail || x.slug === state.detail);
    return [["esc", "back"], ["j/k", "scroll"], ...(m?.status === "pending" ? [["a", "approve"], ["r", "reject"]] : [])];
  },

  render(state, ctx) {
    const th = ctx.theme;
    const { t } = th;
    const w = ctx.width;
    const a = atoms(state, ctx);
    const v = view(state);
    if (v.key !== state.detail) Object.assign(v, { key: state.detail, scroll: 0 });
    const vs = (state.rules ?? []).find((r) => r.id === state.detail || r.slug === state.detail);
    const found = findMemory(state.detail, state, ctx);
    const m = found ? { ...found, symbols: vs?.symbols ?? found.symbols } : vs ? fromVsRule(vs) : null;
    const back = { here: "Here", rules: "Rules", queue: "Queue", feed: "Feed" }[state.tab] ?? v.from ?? "Rules";
    const out = [a.chromeText(`‹ ${back}`), ""];
    if (!m) return [...out, t.muted("This rule isn't in Hivemind anymore.")];

    // kind · scope, title, rule text
    const [word, tone] = kindWord(m);
    const kcol = { locked: t.lockedText, lesson: t.lessonText, muted: t.muted }[tone];
    out.push(`${th.bold(kcol(word))}${t.faint(" · ")}${a.scope(m.scopeId)}`);
    out.push(a.title(m));
    const linked = (slug) => findMemory(slug, state, ctx)?.title ?? slug;
    const body = th.plain(
      String(m.body ?? "")
        .replace(/\[\[([^\]]+)\]\]/g, (_, s) => `"${linked(s)}"`)
        .replace(/\*\*/g, "")
        .replace(/`/g, "")
        .replace(/\s*\n+\s*/g, " "),
    );
    if (body && body !== th.plain(m.title)) out.push(...wrap(t.muted(body), w, 3));
    out.push("");

    // the timeline (hero)
    const rail = a.hair(" │");
    const nodes = timeline(m, state, ctx, a);
    nodes.forEach((n, i) => {
      const dotCol = { ok: a.ok, locked: t.locked, lesson: t.lesson, muted: t.muted }[n.tone] ?? t.muted;
      out.push(`${dotCol(` ${n.dot} `)}${t.faint(String(n.when).padEnd(8))}${n.body}`);
      if (n.quote) for (const l of wrap(t.text(`"${th.plain(n.quote)}"`), w - 13, 3)) out.push(`${rail}          ${l}`);
      for (const l of n.lines ?? []) out.push(`${rail}          ${l}`);
      if (i < nodes.length - 1) out.push(rail);
    });
    out.push("");

    // why: every piece of evidence (with permalinks) and the counts (shared with `hivemind why`)
    const facts = whyFacts(m, { memories: allMemories(state, ctx), fired: state.fired?.[m.id] ?? 0 });
    out.push(...whyLines(facts, { width: w, root: state.workspace?.root, skipOrigin: true }), "");

    // facts
    const fact = (k, val) => `${t.faint(k.padEnd(13))}${val}`;
    const owner = ownerHandle(m);
    const p = state.people.find((x) => x.id === owner);
    const status =
      m.status === "active" ? (m.locked ? t.lockedText("locked") : a.ok("active")) : m.status === "pending" ? t.lessonText("waiting") : m.status === "blocked" ? t.lockedText("blocked") : t.muted(m.status);
    const n = inContext(m, state);
    out.push(fact("Scope", a.scope(m.scopeId)));
    out.push(fact("Owner", `${a.handle(owner)}${p ? t.faint(` ${ROLE[p.role]}`) : ""}`));
    out.push(fact("Status", status));
    out.push(fact("In context", m.status !== "active" ? t.faint("not yet") : n ? t.text(`${n} agent${n > 1 ? "s" : ""}`) + t.faint(" working now") : t.faint("no agents running")));
    const related = [...new Set([...String(m.body ?? "").matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1]))]
      .map((slug) => findMemory(slug, state, ctx))
      .filter((x) => x && x.id !== m.id);
    if (related.length) out.push(fact("Related", related.map((r) => (r.locked ? t.lockedText : t.lessonText)(th.plain(r.title))).join(t.faint(" · "))));

    // broken right now (the watcher's flags)
    const hits = [];
    for (const [file, list] of Object.entries(state.flags ?? {}))
      for (const f of list ?? []) if (f.ruleId === m.id) hits.push({ file, f, text: (state.files?.[file]?.text ?? "").split(/\r?\n/)[f.startLine] ?? "" });
    if (hits.length) {
      out.push("", th.bold(t.lockedText("BROKEN RIGHT NOW")) + t.faint(` · ${hits.length}`));
      for (const { file, f, text } of hits.slice(0, 5)) out.push(`${linkFile(file, f.startLine + 1, f.endLine > f.startLine ? f.endLine + 1 : undefined, { root: state.workspace?.root })}  ${t.muted(text.trim())}`);
    } else if (m.status === "active") out.push(fact("Broken now", t.faint("nowhere in the files you've changed")));

    const room = Math.max(3, ctx.height);
    v.scroll = Math.max(0, Math.min(v.scroll, out.length - room));
    return out.slice(v.scroll, v.scroll + room).map((l) => th.clip(l, w));
  },

  onKey(key, state, ctx) {
    const v = view(state);
    if (key.name === "j" || key.name === "down") return (v.scroll += 1), true;
    if (key.name === "k" || key.name === "up") return (v.scroll = Math.max(0, v.scroll - 1)), true;
    const m = findMemory(state.detail, state, ctx);
    if (m?.status === "pending" && (key.name === "a" || key.name === "r")) {
      (key.name === "a" ? ctx.actions.approve : ctx.actions.reject)(m);
      return true;
    }
    return false;
  },
};
