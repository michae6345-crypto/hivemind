// Here (owner: J): the terminal version of the editor highlight, after public/brand/terminal/terminal-spec.md and
// shots/here.png. The file that last changed, who saved it, then what it breaks: kind label + scope chip, the rule
// title, a code frame with the exact expression tinted and underlined ~~~~ (rose = locked rule, honey = team lesson)
// and a two-word note, the provenance, the quote, `f fix: …`. Then the rules it follows, or the all-clear.
// New hits soft-flash in (faint → muted → full over 3 frames).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { colsFor, explanation } from "../../lib/check.mjs";

const CHIP_BG = "#2A2A2E";
const SEL_BG = "#232A45";
const FLASH_MS = [100, 200]; // alpha .35 until 100ms, .7 until 200ms, then 1
const at = (h) => (String(h).startsWith("@") ? String(h) : `@${h}`);
const bare = (h) => String(h ?? "").replace(/^@/, "");
const expand = (s) => String(s ?? "").replace(/\t/g, "  ");
const ul = (th, s) => (th.COLOR ? `\x1b[4m${s}\x1b[24m` : s);
const keyOf = (v, lines) => `${v.ruleSlug}:${(lines[v.startLine] ?? "").trim()}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ago(ms, now) {
  if (!ms || isNaN(ms)) return "";
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const day = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
};

// ---------- chips (terminal-spec §4: one space of chip bg each side, the dot in the layer colour) ----------
function chips(th, state) {
  const { P, bg, fg, t } = th;
  const pill = (inner) => (th.COLOR ? bg(CHIP_BG)(` ${inner} `) : inner);
  const layerOf = (id) => {
    const role = state.people?.find((p) => p.id === id)?.role;
    return role === "security" ? P.org : role === "lead" ? P.team : P.repo;
  };
  return {
    handle: (h, pos = false) => pill(`${fg(layerOf(bare(h)))("●")} ${t.text(`@${bare(h)}${pos ? "'s" : ""}`)}`),
    scope: (id) => {
      const col = id === "org" ? P.org : id.startsWith("team/") ? P.team : id.startsWith("repo/") ? P.repo : P.personal;
      return pill(`${fg(col)(id.startsWith("personal/") ? "○" : "●")} ${t.text(`#${id}`)}`);
    },
  };
}

/** A title with `code` tokens underlined in the rule's colour (bold text otherwise). */
function titleLine(th, title, locked) {
  const { t, bold, plain } = th;
  const code = locked ? t.lockedText : t.lessonText;
  return plain(title)
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((p) => (p.startsWith("`") ? ul(th, code(p.slice(1, -1))) : bold(t.text(p))))
    .join("");
}

/** The two-or-three-word note after the ~~~~. */
function shortNote(v) {
  const why = explanation(v);
  if (/^Combines/i.test(why)) return "two labs";
  const slug = v.ruleSlug;
  if (slug === "sec-lab-isolation" || /assertSingleCustomer/.test(v.ruleTitle)) return "no assertSingleCustomer";
  if (slug === "use-logger") return "use logger";
  if (slug === "sec-no-pii-logs") return "personal info";
  if (slug === "money-integer-cents") return "float money";
  return v.locked ? "locked rule" : "team lesson";
}

/** Provenance lines: `Set by ● @maya Security · locked 14 Oct` / `Learned from ● @alex's correction · 3h ago` + `Approved by ● @jordan · …`. */
function provenance(th, ch, rule, v, state, now) {
  const { t, sep } = th;
  const owner = rule?.handle || rule?.ownerId || String(v?.owner ?? "").split(/[\s(,]/)[0] || "a lead";
  const via = rule?.learnedVia;
  if (rule?.locked ?? v?.locked) {
    const when = day(via?.at ?? rule?.taughtAt);
    return [`${t.muted("Set by ")}${ch.handle(owner)}${rule?.ownerRole ? t.muted(` ${rule.ownerRole}`) : ""}${when ? sep() + t.muted(`locked ${when}`) : ""}`];
  }
  const by = via?.by || owner;
  const when = ago(Date.parse(via?.at ?? rule?.taughtAt), now);
  const tail = when ? sep() + t.muted(when) : "";
  const first =
    via?.kind === "correction" ? `${t.muted("Learned from ")}${ch.handle(by, true)}${t.muted(" correction")}${tail}`
    : via?.kind === "review" ? `${t.muted("Learned from ")}${ch.handle(by, true)}${t.muted(" code review")}${tail}`
    : via?.kind === "agent" ? `${t.muted("Proposed by an agent")}${tail}`
    : `${t.muted("Written by ")}${ch.handle(by)}${tail}`;
  const fromFeed = (state.live?.feed ?? []).find((f) => f.type === "approval" && f.memoryId === rule?.id && String(f.id).startsWith("ev-"))?.actor;
  const scopeOwner = state.scopes?.find((s) => s.id === rule?.scopeId)?.owner;
  const approver = fromFeed ?? (scopeOwner && bare(scopeOwner) !== bare(by) ? scopeOwner : null);
  return approver ? [first, `${t.muted("Approved by ")}${ch.handle(approver)}${t.muted(" · in every agent's next session")}`] : [first];
}

/** The evidence verbatim (`"…"`), else the rule body; wrapped to at most 2 lines. */
function quoteLines(th, rule, w) {
  const m = rule?.learnedFrom?.match(/"(.+)"\s*$/);
  const text = th.plain(m ? m[1] : String(rule?.summary ?? "").replace(/\*\*/g, "").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/`/g, ""));
  if (!text || text === th.plain(rule?.title ?? "")) return [];
  const room = w - 2;
  const rows = [""];
  for (const word of text.split(/\s+/)) {
    if (rows[rows.length - 1] && (rows[rows.length - 1] + " " + word).length > room) {
      if (rows.length === 2) {
        rows[1] = rows[1].replace(/\s*\S*$/, "") + "…";
        break;
      }
      rows.push("");
    }
    rows[rows.length - 1] = (rows[rows.length - 1] + " " + word).trim();
  }
  return rows.map((r, k) => th.t.muted(`${k ? " " : "“"}${r}${k === rows.length - 1 ? "”" : ""}`));
}

/** One broken rule: label + chip, title, code frame, provenance, quote, fix. */
function broken(th, ch, v, lines, file, rule, state, ctx, selected) {
  const { t, P, bg, mix, bold, sep, clip } = th;
  const w = ctx.width;
  const tone = v.locked ? t.lockedText : t.lessonText;
  const rail = selected ? t.blue("▎") : "";
  const out = [];
  out.push(clip(`${rail}${bold(tone(v.locked ? "BREAKS A LOCKED RULE" : "MISSES A TEAM LESSON"))}${rule?.scopeId ? sep() + ch.scope(rule.scopeId) : ""}`, w));
  out.push(clip(titleLine(th, v.ruleTitle, v.locked), w));

  const first = Math.max(0, v.startLine - 1);
  const last = Math.min(lines.length - 1, v.endLine + 1);
  const gw = Math.max(2, String(last + 1).length);
  const code = w - gw - 3;
  const g = (s) => t.faint(s);
  const tint = bg(mix(v.locked ? P.locked : P.lesson, "#1C1C1E", v.locked ? 0.16 : 0.13));
  const [sc] = colsFor(v, v.startLine, lines[v.startLine] ?? "", rule);
  out.push(clip(`${" ".repeat(gw - 1)}${g("╭─[")}${t.muted(`${file}:${v.startLine + 1}:${sc + 1}`)}${g("]")}`, w));
  for (let i = first; i <= last; i++) {
    const text = expand(lines[i]);
    const hit = i >= v.startLine && i <= v.endLine;
    const num = g(`${String(i + 1).padStart(gw)} │ `);
    if (!hit) {
      out.push(clip(`${num}${t.muted(text)}`, w));
      continue;
    }
    const [s, e] = colsFor(v, i, lines[i] ?? "", rule);
    const a = Math.min(s, Math.max(0, code - 1));
    const b = Math.min(Math.max(e, a + 1), code);
    out.push(clip(`${num}${t.text(text.slice(0, a))}${tint(t.text(text.slice(a, b)))}${t.text(text.slice(b))}`, w));
    if (i === v.endLine) out.push(clip(`${" ".repeat(gw)}${g(" │ ")}${" ".repeat(a)}${tone("~".repeat(Math.max(1, b - a)))} ${tone(shortNote(v))}`, w));
  }
  out.push(`${" ".repeat(gw - 1)}${g("╰─")}`);
  out.push(...provenance(th, ch, rule, v, state, ctx.now).map((l) => clip(l, w)));
  out.push(...quoteLines(th, rule, w).map((l) => clip(l, w)));
  if (v.fix) out.push(clip(`${bold(t.blueText("f"))} ${t.faint(`fix: ${th.plain(v.fix.title.replace(/^Fix:\s*/i, ""))}`)}`, w));
  return out;
}

/** Rules that apply to this file and aren't broken: they name it, or code they name appears in it. */
function followed(state, text, brokenIds) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const r of state.rules ?? []) {
    if (r.kind === "owner" || brokenIds.has(r.id)) continue;
    let where = null;
    for (const sym of (r.symbols ?? []).filter((s) => s.length >= 3)) {
      const re = new RegExp(`(?<![\\w$.])${esc(sym)}(?![\\w$])`);
      // A use of the symbol, not its definition or a comment.
      const def = new RegExp(`\\b(function|def|const|let|var|class)\\s+${esc(sym)}\\b`);
      const i = lines.findIndex((l) => re.test(l) && !def.test(l) && !/^\s*(\/\/|\*|#)/.test(l));
      if (i < 0) continue;
      const l = lines[i];
      const s = l.search(re);
      let e = s + sym.length;
      if (l[e] === "(") e = Math.max(e, l.indexOf(")", e) + 1);
      where = { line: i, code: l.slice(s, e) };
      break;
    }
    if (where || r.mentionsFile) out.push({ r, where });
  }
  return out.sort((a, b) => Number(!!b.where) - Number(!!a.where) || Number(b.r.locked) - Number(a.r.locked));
}

function followedBlock(th, ch, { r, where }, state, ctx) {
  const { t, bold, sep, clip } = th;
  const w = ctx.width;
  const tone = r.locked ? t.lockedText : t.lessonText;
  const out = [
    clip(`${bold(tone(r.locked ? "LOCKED RULE" : "TEAM LESSON"))}${sep()}${ch.scope(r.scopeId)}`, w),
    clip(titleLine(th, r.title, r.locked), w),
    ...provenance(th, ch, r, null, state, ctx.now).map((l) => clip(l, w)),
  ];
  if (where) out.push(clip(`${t.faint(`Followed on line ${where.line + 1} `)}${ul(th, tone(where.code))}`, w));
  return out;
}

const quietRow = (th, ch, { r }, w) =>
  th.clip(`${(r.locked ? th.t.lockedText : th.t.lessonText)("▎")} ${th.t.muted(th.plain(r.title).replace(/`/g, ""))}${th.sep()}${ch.handle(r.handle || r.ownerId)}`, w);

/** Apply a violation's suggested edit to the file on disk; the watcher re-checks it. */
function applyFix(root, file, v) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const f = v.fix;
  if (f.kind === "insertBefore") lines.splice(f.line, 0, ...f.text.split("\n"));
  else lines.splice(f.line, (f.endLine ?? f.line) - f.line + 1, ...f.text.split("\n"));
  writeFileSync(path, lines.join(eol));
}

/** The writer of `file` from the hooks' activity (`saved by ● @alex Claude Code`), within 3 minutes. */
function writer(state, file, now) {
  const f = file.toLowerCase();
  return (state.live?.items ?? []).find((a) => {
    const g = String(a.file ?? "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    return now - Date.parse(a.createdAt) < 3 * 60000 && (g === f || f.endsWith("/" + g) || g.endsWith("/" + f));
  });
}

const visible = (state) => {
  const file = state.lastFile;
  if (!file) return [];
  const dismissed = state.view.here?.dismissed?.[file];
  return dismissed && dismissed === state.files[file]?.at ? [] : (state.flags[file] ?? []);
};
const ordered = (vs) => [...vs].sort((a, b) => Number(b.locked) - Number(a.locked) || a.startLine - b.startLine);

export default {
  id: "here",
  title: "Here",
  count: (state) => visible(state).length || null,
  keys: (state) => {
    const vs = ordered(visible(state));
    if (!vs.length) return [];
    const sel = vs[Math.min(state.view.here?.index ?? 0, vs.length - 1)];
    return [...(sel?.fix ? [["f", "fix"]] : []), ...(vs.length > 1 ? [["j/k", "next"]] : []), ["enter", "rule"], ["esc", "dismiss"]];
  },
  render(state, ctx) {
    const th = ctx.theme;
    const { t, sep } = th;
    const { width: w, height: h, now } = ctx;
    const ch = chips(th, state);
    const file = state.lastFile;
    if (!file) return [t.muted("No changes yet."), t.faint("Edit a file, or let an agent, and what it breaks shows up here.")];
    const f = state.files[file] ?? {};
    const vs = ordered(visible(state));
    const lines = (f.text ?? "").split(/\r?\n/);
    const view = (state.view.here ??= {});
    const index = Math.min(view.index ?? 0, Math.max(0, vs.length - 1));

    const who = writer(state, file, now);
    const by = who ? `${t.faint(" · saved by ")}${ch.handle(who.actor)}${who.agent && th.toolName(who.agent) ? t.faint(` ${th.toolName(who.agent)}`) : ""}` : t.faint(" · changed");
    const out = [th.clip(`${t.text(file)}${by}${t.faint(` · ${f.checking ? "checking" : ago(f.at, now)}`)}`, w)];

    if (!vs.length) {
      if (f.checking && !f.checkedAt) return out;
      const n = (state.rules ?? []).filter((r) => r.kind !== "owner").length;
      out.push("", t.ok("This file follows every team rule."), t.faint(`${n} ${n === 1 ? "rule" : "rules"} checked · ${ago(f.checkedAt ?? f.at, now)}`));
      const fol = followed(state, f.text ?? "", new Set());
      if (fol.length) out.push("", ...followedBlock(th, ch, fol[0], state, ctx), ...fol.slice(1, 6).map((x) => quietRow(th, ch, x, w)));
      return out;
    }

    const locked = vs.filter((v) => v.locked).length;
    out.push(`${t.text(`${vs.length} ${vs.length === 1 ? "rule" : "rules"} broken`)}${locked ? sep() + t.locked(`${locked} locked`) : ""}`);
    for (const [i, v] of vs.entries()) {
      const rule = state.rules.find((r) => r.id === v.ruleId);
      const block = () => broken(th, ch, v, lines, file, rule, state, ctx, vs.length > 1 && i === index);
      const age = now - (view.born?.[`${file}|${keyOf(v, lines)}`] ?? 0);
      const alpha = th.REDUCED ? 1 : age < FLASH_MS[0] ? 0.35 : age < FLASH_MS[1] ? 0.7 : 1;
      out.push("", ...(alpha < 1 ? th.faded(alpha, block) : block()));
    }
    const fol = followed(state, f.text ?? "", new Set(vs.map((v) => v.ruleId)));
    if (fol.length && out.length + 3 <= h) {
      const big = followedBlock(th, ch, fol[0], state, ctx);
      if (out.length + big.length + 1 <= h) out.push("", ...big);
      else out.push("", th.bold(t.faint(`ALSO APPLIES HERE · ${fol.length}`)), quietRow(th, ch, fol[0], w));
      for (const x of fol.slice(1)) if (out.length < h) out.push(quietRow(th, ch, x, w));
    }
    return out;
  },
  onKey(key, state, ctx) {
    const file = state.lastFile;
    const vs = ordered(visible(state));
    if (!vs.length) return false;
    const view = (state.view.here ??= {});
    const i = Math.min(view.index ?? 0, vs.length - 1);
    if (key.name === "j" || key.name === "down") return (view.index = Math.min(vs.length - 1, i + 1)), true;
    if (key.name === "k" || key.name === "up") return (view.index = Math.max(0, i - 1)), true;
    if (key.name === "return" || key.name === "enter") return ctx.actions.openDetail(vs[i].ruleId), true;
    if (key.name === "escape") return ((view.dismissed ??= {})[file] = state.files[file]?.at), true;
    if (key.ch === "f" || (key.name === "f" && !key.ctrl)) {
      const v = vs[i];
      if (!v.fix) return ctx.actions.toast("No automatic fix for this one. Follow the rule by hand.", "muted"), true;
      try {
        applyFix(ctx.cfg.root, file, v);
        ctx.actions.toast(`Fixed: ${ctx.theme.plain(v.fix.title.replace(/^Fix:\s*/i, ""))}. Checking again.`, "ok", 3000);
      } catch (e) {
        ctx.actions.toast(`Couldn't apply the fix: ${e.message}`, "locked");
      }
      return true;
    }
    return false;
  },
};
