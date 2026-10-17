// The terminal version of the editor highlight: a compact rustc-style frame. The offending expression gets the
// editor's tint (rose .16 / honey .13) and a ~~~~ underline in the rule's colour; then the rule, the owner, the fix.
import { colsFor, explanation } from "../lib/check.mjs";
import { P, bg, bold, mix, plain, sep, t } from "./theme.mjs";
import { clip } from "./term.mjs";

const expand = (s) => String(s ?? "").replace(/\t/g, "  ");

/** Lines (ANSI) for one violation, `w` columns wide. */
export function codeFrame(file, lines, v, rule, w) {
  const tone = v.locked ? t.locked : t.lesson;
  const toneText = v.locked ? t.lockedText : t.lessonText;
  const tint = bg(mix(v.locked ? P.locked : P.lesson, P.bg, v.locked ? 0.16 : 0.13));
  const first = Math.max(0, v.startLine - 1);
  const last = Math.min(lines.length - 1, v.endLine + (v.endLine > v.startLine ? 0 : 1));
  const gw = String(last + 1).length;
  const bar = t.faint(`${" ".repeat(gw)} │`);
  const code = w - gw - 4;
  const [sc] = colsFor(v, v.startLine, lines[v.startLine] ?? "", rule);

  const label = v.locked ? "LOCKED RULE" : "TEAM LESSON";
  const out = [
    `${bold(tone(label))}${sep()}${bold(t.text(plain(v.ruleTitle)))}`,
    `${" ".repeat(gw)} ${t.faint("╭─[")}${t.blueText(file)}${t.faint(`:${v.startLine + 1}:${sc + 1}]`)}`,
  ];
  for (let i = first; i <= last; i++) {
    const text = expand(lines[i]);
    const hit = i >= v.startLine && i <= v.endLine;
    const num = hit ? tone(String(i + 1).padStart(gw)) : t.faint(String(i + 1).padStart(gw));
    if (!hit) {
      out.push(`${num} ${t.faint("│")} ${t.faint(clip(text, code))}`);
      continue;
    }
    const [s, e] = colsFor(v, i, lines[i] ?? "", rule);
    const a = Math.min(s, code - 1);
    const b = Math.min(Math.max(e, s + 1), code);
    const body = t.text(text.slice(0, a)) + tint(t.text(text.slice(a, b))) + t.text(text.slice(b));
    out.push(`${num} ${tone("│")} ${clip(body, code)}`);
    if (i === v.endLine || v.startLine === v.endLine) {
      const why = explanation(v) || (v.locked ? "breaks a locked rule" : "doesn't follow a team lesson");
      out.push(clip(`${bar} ${" ".repeat(a)}${tone("~".repeat(Math.max(1, b - a)))} ${toneText(why)}`, w));
    }
  }
  const owner = v.owner?.startsWith("@") ? v.owner : `@${rule?.ownerId ?? "a lead"}`;
  const role = rule?.ownerRole ? sep() + t.muted(rule.ownerRole) : "";
  out.push(`${" ".repeat(gw)} ${t.faint("├─")} ${t.muted(v.locked ? "owner" : "from ")} ${t.handle(owner)}${role}`);
  out.push(
    `${" ".repeat(gw)} ${t.faint("╰─")} ${t.muted("fix  ")} ${
      v.fix ? t.ok(plain(v.fix.title.replace(/^Fix:\s*/i, ""))) + t.faint("   f applies it") : t.muted("no automatic fix; follow the rule")
    }`,
  );
  return out.map((l) => clip(l, w));
}
