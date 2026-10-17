// "Why does this rule exist?" Shared by `hivemind watch` (w / e → Detail) and `hivemind why` (agent G).
// Pure: give it a memory (GET /api/memories shape) and the memories around it; it returns facts, then lines.
//   const f = whyFacts(memory, { memories, fired });
//   whyLines(f, { width: 64, root })  → string[] (ANSI; plain under NO_COLOR): EVIDENCE · N, one entry per piece of
//   evidence (who, what, when, the quote, a clickable path#Lnn), then the counts line
//   ("reinforced 3× · fired 2× this session · blocked 1 lesson").
import { linkFile, link } from "./git.mjs";
import { bold, plain, t } from "./theme.mjs";
import { wrap } from "./term.mjs";

/**
 * Does `lesson`'s block name `rule`? The engine has written both forms:
 *   old: Contradicts 🔒 [[sec-lab-isolation]] (Greg, Security): …
 *   new: Contradicts @greg's locked rule "Never mix data from different lab customers".
 */
export const blocks = (lesson, rule) => {
  const r = String(lesson?.blockedReason ?? "");
  return !!rule && ((!!rule.slug && r.includes(`[[${rule.slug}]]`)) || (!!rule.title && r.includes(`"${rule.title}"`)));
};
/** The locked rule that blocked `lesson`, from `memories` (null if it isn't loaded). */
export const blockingRule = (lesson, memories = []) => memories.find((x) => x.locked && blocks(lesson, x)) ?? null;

const isApproval = (e) => e?.type === "manual" && /^Approved by /.test(e.quote ?? "");
const handle = (a) => (!a || String(a).startsWith("agent") ? "an agent" : `@${String(a).replace(/^@/, "")}`);
const day = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short" }) : "");

/**
 * { origin, approval, evidence, reinforced, fixes, blocked, fired }
 *   evidence   every non-approval evidence entry, oldest first (the first is where the rule came from)
 *   reinforced how many later corrections / reviews / fixes backed it up (evidence after the first)
 *   blocked    for a locked rule: the lessons it stopped (status blocked, blockedReason names it)
 *   fired      how many times watch flagged it this session (the caller counts; 0 if unknown)
 */
export function whyFacts(m, { memories = [], fired = 0 } = {}) {
  const all = m?.evidence ?? [];
  const evidence = all.filter((e) => !isApproval(e)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const blocked = m?.locked
    ? memories.filter((x) => x.status === "blocked" && blocks(x, m))
    : [];
  return {
    origin: evidence[0] ?? null,
    approval: [...all].reverse().find(isApproval) ?? null,
    evidence,
    reinforced: Math.max(0, evidence.length - 1),
    fixes: evidence.filter((e) => e.type === "fix").length,
    blocked,
    fired,
  };
}

const VERB = {
  correction: "corrected an agent",
  review_comment: "left a review comment",
  fix: "fixed",
  agent: "proposed it",
  manual: "wrote it",
};

/** One entry: `○ Oct 14  @kevin fixed src/welcome.ts#L2` + the quote (wrapped, muted). */
function entry(e, i, { width, root }) {
  const where = e.file
    ? e.url
      ? link(e.url, t.blueText(`${e.file}${e.line ? `#L${e.line}` : ""}`))
      : linkFile(e.file, e.line ?? undefined, undefined, { root, label: `${e.file}${e.line ? `#L${e.line}` : ""}` })
    : e.url
      ? link(e.url, t.blueText(e.ref ?? "link"))
      : "";
  const dot = i === 0 ? t.lesson("●") : t.muted("○");
  const head = ` ${dot} ${t.faint(day(e.at).padEnd(7))}${t.handle(handle(e.actor))} ${t.muted(VERB[e.type] ?? e.type)}${where ? ` ${where}` : ""}${i === 0 ? t.faint("  · where it came from") : ""}`;
  const out = [head];
  const q = plain(e.quote ?? "");
  if (q && !/^(Written|Proposed) by /.test(q)) {
    // fix quotes are diff excerpts: show them as code, one line each
    const diff = q.split("\n");
    const pick = [...diff.filter((l) => l.startsWith("-")).slice(0, 2), ...diff.filter((l) => l.startsWith("+")).slice(0, 2)];
    const lines = e.type === "fix" ? (pick.length ? pick : diff.slice(0, 4)).map((l) => (l.startsWith("+") ? t.ok(l) : l.startsWith("-") ? t.lockedText(l) : t.muted(l))) : wrap(t.text(`"${q}"`), width - 13, 3);
    for (const l of lines) out.push(`${t.hair(" │")}          ${l}`);
  }
  return out;
}

/**
 * The evidence section + the counts line, fitted to `width`.
 * skipOrigin: the caller already shows where the rule came from (watch's Detail timeline), so list only what came after.
 */
export function whyLines(f, { width = 64, root = process.cwd(), skipOrigin = false } = {}) {
  const out = [];
  const first = skipOrigin ? 1 : 0;
  const list = f.evidence.slice(first);
  if (list.length) {
    out.push(bold(t.faint(`${skipOrigin ? "REINFORCED BY" : "EVIDENCE"} · ${list.length}`)));
    const shown = list.slice(-6);
    if (list.length > 6) out.push(t.faint(`   … ${list.length - 6} earlier`));
    shown.forEach((e, i) => {
      out.push(...entry(e, first + list.length - shown.length + i, { width, root }));
      if (i < shown.length - 1) out.push(t.hair(" │"));
    });
  }
  const counts = [
    f.reinforced ? t.text(`reinforced ${f.reinforced}×`) : t.faint("no reinforcements yet"),
    f.fixes ? t.text(`${f.fixes} fix${f.fixes > 1 ? "es" : ""}`) : null,
    f.fired ? t.lockedText(`fired ${f.fired}× this session`) : null,
    f.blocked.length ? t.lockedText(`blocked ${f.blocked.length} lesson${f.blocked.length > 1 ? "s" : ""}`) : null,
  ].filter(Boolean);
  out.push(...(out.length ? [""] : []), counts.join(t.faint(" · ")));
  return out;
}
