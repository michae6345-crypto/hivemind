import { DATA_FN, DATA_PARAM, bodyEnd, indentOf, parseSig, violation } from "../shared";
import type { QuickFix, Violation, VsRule } from "../types";

// Deterministic fast path for POST /api/vscode/check: no LLM, a few ms. Each detector binds to the team rule it
// enforces (found by slug/symbol/title), so a team without that rule never sees the squiggle.
//   🔒 lab isolation: mixing Lab A/B rows, or an export/write function over rows without assertSingleCustomer()
//   🔒 no PII in logs: logging an expert's email/phone/name
//   lesson: console.* instead of logger · money as float dollars instead of integer cents
// At most one violation per rule per function/line, so the same problem is never flagged twice.

const isComment = (s: string) => /^\s*(\/\/|\*|\/\*)/.test(s);
const find = (rules: VsRule[], slug: string, test: (r: VsRule) => boolean) => rules.find((r) => r.slug === slug) ?? rules.find(test);

export type RuleSet = { lab?: VsRule; pii?: VsRule; log?: VsRule; money?: VsRule };

export function pickRules(rules: VsRule[]): RuleSet {
  const asc = rules.filter((r) => r.symbols.includes("assertSingleCustomer"));
  return {
    lab: rules.find((r) => r.slug === "sec-lab-isolation") ?? asc.find((r) => r.locked) ?? asc[0] ?? rules.find((r) => /lab customer/i.test(r.title)),
    pii: find(rules, "sec-no-pii-logs", (r) => /personal info|\bpii\b/i.test(r.title)),
    log: find(rules, "use-logger", (r) => r.symbols.includes("console.log") || /console\.log/.test(r.title)),
    money: find(rules, "money-integer-cents", (r) => /\bcents\b/i.test(r.title)),
  };
}

type Span = { start: number; end: number; sig?: NonNullable<ReturnType<typeof parseSig>> };

/** Top-level functions (with bodies) + the module-level remainder, so detectors can reason per function. */
function spans(lines: string[]): Span[] {
  const fns: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isComment(lines[i])) continue;
    const sig = parseSig(lines, i);
    if (!sig || sig.braceLine === null) continue;
    const end = bodyEnd(lines, sig.braceLine, sig.braceCol);
    fns.push({ start: i, end, sig });
    i = end; // top-level only
  }
  return fns;
}

export function detect(lines: string[], rules: VsRule[]): Violation[] {
  const R = pickRules(rules);
  const out: Violation[] = [];
  const fns = spans(lines);

  // ---- 🔒 lab isolation: mixing two lab customers' rows (per function, plus module level)
  const mixedFns = new Set<Span>();
  if (R.lab) {
    const segments: Span[] = [...fns, { start: 0, end: lines.length - 1 }];
    for (const seg of segments) {
      const mix = labMix(lines, seg, seg.sig ? undefined : fns);
      if (!mix) continue;
      if (seg.sig) mixedFns.add(seg);
      out.push(violation(R.lab, mix.line, mix.line, "regex", mix.fix, mix.why));
    }
  }

  // ---- 🔒 lab isolation: export/write function over rows that never calls assertSingleCustomer()
  if (R.lab) {
    for (const f of fns) {
      const sig = f.sig!;
      if (mixedFns.has(f) || !DATA_FN.test(sig.name)) continue;
      const body = [lines[sig.braceLine!].slice(sig.braceCol), ...lines.slice(sig.braceLine! + 1, f.end + 1)].join("\n");
      if (/\bassertSingleCustomer\s*\(/.test(body)) continue;
      let arg = sig.params.find((p) => DATA_PARAM.test(p));
      let at = sig.braceLine! + 1;
      let indent = "";
      if (!arg) {
        // e.g. `const rows = await fetchRows()` inside the body → assert right after it
        const j = lines.findIndex((s, k) => k > sig.braceLine! && k < f.end && /\b(?:const|let|var)\s+(rows|records|items|data)\b/.test(s));
        if (j < 0) continue;
        arg = lines[j].match(/\b(?:const|let|var)\s+(rows|records|items|data)\b/)![1];
        at = j + 1;
        indent = indentOf(lines[j]);
      }
      if (!indent) {
        const firstBody = lines.slice(at, f.end).find((s) => s.trim());
        indent = firstBody ? indentOf(firstBody) : sig.indent + "  ";
      }
      const fix: QuickFix | undefined =
        f.end > sig.braceLine! && at <= f.end ? { title: `Fix: add assertSingleCustomer(${arg})`, kind: "insertBefore", line: at, text: `${indent}assertSingleCustomer(${arg});` } : undefined;
      out.push(violation(R.lab, sig.line, sig.line, "regex", fix));
    }
  }

  // ---- 🔒 no PII in logs + console.* → logger (both per log call)
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (isComment(s)) continue;
    const call = s.match(LOG_CALL);
    if (!call) continue;
    const text = callText(lines, i);
    if (R.pii) {
      const pii = text.match(PII);
      if (pii) {
        const field = pii[2] ?? pii[0];
        const fixed = s.replace(PII_ACCESS, (_m, obj: string) => `${obj}.id`).replace(PII_KEY, "expertId:");
        const fix: QuickFix | undefined = fixed !== s ? { title: "Fix: log the expert id instead", kind: "replaceLines", line: i, endLine: i, text: fixed } : undefined;
        out.push(violation(R.pii, i, i, "regex", fix, `Logs an expert's ${field.replace(/_/g, " ").toLowerCase()}.`));
      }
    }
    if (R.log && call[1] === "console") {
      const m = s.match(CONSOLE_RE)!;
      const fix: QuickFix = {
        title: `Fix: use logger.${LOGGER[m[1]]} instead of console.${m[1]}`,
        kind: "replaceLines",
        line: i,
        endLine: i,
        text: s.replace(new RegExp(CONSOLE_RE.source, "g"), (_, f: string) => `logger.${LOGGER[f]}(`),
      };
      out.push(violation(R.log, i, i, "regex", fix));
    }
  }

  // ---- money as float dollars (lesson: integer cents)
  if (R.money) {
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i];
      if (isComment(s) || !MONEY_WORD.test(s)) continue;
      const hit = MONEY.find(([re]) => re.test(s));
      if (!hit) continue;
      const [re, why, fixer] = hit;
      const fixed = fixer?.(s, re);
      const fix: QuickFix | undefined = fixed && fixed !== s ? { title: "Fix: keep money in integer cents", kind: "replaceLines", line: i, endLine: i, text: fixed } : undefined;
      out.push(violation(R.money, i, i, "regex", fix, why));
    }
  }
  return out.sort((a, b) => a.startLine - b.startLine || Number(b.locked) - Number(a.locked));
}

// ---------- lab mixing ----------
const LAB_LIT = /(['"`])(lab[-_ ]?[a-z0-9]+)\1/gi;
const FETCH_CALL = /\b((?!assert)\w*(?:Customer|Lab)\w*)\s*\(\s*([^()]*?)\s*\)/g; // rowsForCustomer("lab-a"), fetchLab(labB)
const LAB_IDENT = /\blab[-_]?([A-Z0-9]|[a-z0-9](?=[A-Z_]|Rows|Data|Records))\w*/g; // labARows, labB, lab_a_rows
const COMBINE = /\[\s*\.\.\.[\w.]+[^\]]*,\s*\.\.\.[\w.]+|\.concat\s*\(|\.push\s*\(\s*\.\.\.|Object\.assign\s*\(|\bmerge\w*\s*\(/;

function labMix(lines: string[], seg: Span, excludeFns?: Span[]): { line: number; why: string; fix?: QuickFix } | null {
  const skip = (i: number) => isComment(lines[i]) || !!excludeFns?.some((f) => i >= f.start && i <= f.end);
  const calls = new Map<string, number>(); // distinct fetch args → line
  const idents = new Map<string, number>();
  let combineLine = -1;
  for (let i = seg.start; i <= seg.end; i++) {
    if (skip(i)) continue;
    const s = lines[i];
    // one line that selects two labs at once: `id === "lab-a" || id === "lab-b"`, ["lab-a", "lab-b"].includes(…)
    const lits = new Set([...s.matchAll(LAB_LIT)].map((m) => m[2].toLowerCase()));
    if (lits.size >= 2 && /\|\||\.includes\s*\(|\bin\s*\[|\.filter\s*\(/.test(s)) {
      return { line: i, why: `Selects rows from ${[...lits].slice(0, 2).join(" and ")} together.` };
    }
    for (const m of s.matchAll(FETCH_CALL)) if (m[2] && !calls.has(m[2])) calls.set(m[2], i);
    for (const m of s.matchAll(LAB_IDENT)) {
      const id = m[0].toLowerCase().replace(/[-_]/g, "").slice(0, 4);
      if (!idents.has(id)) idents.set(id, i);
    }
    if (combineLine < 0 && COMBINE.test(s)) combineLine = i;
  }
  const names = (m: Map<string, number>) => [...m.keys()].slice(0, 2).map((k) => k.replace(/^['"`]|['"`]$/g, ""));
  let why = "";
  let line = -1;
  if (calls.size >= 2 && (combineLine >= 0 || [...calls.keys()].some((k) => /lab/i.test(k)))) {
    why = `Combines rows from ${names(calls).join(" and ")} in one export.`;
    line = combineLine >= 0 ? combineLine : [...calls.values()][1];
  } else if (idents.size >= 2 && combineLine >= 0) {
    why = "Combines two lab customers' rows in one export.";
    line = combineLine;
  }
  if (line < 0) return null;
  const v = lines[line].match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/)?.[1];
  const after = v ? lines.slice(line + 1, seg.end + 1).join("\n") : "";
  if (v && new RegExp(`assertSingleCustomer\\s*\\(\\s*${v}\\b`).test(after)) return null;
  const fix: QuickFix | undefined = v ? { title: `Fix: add assertSingleCustomer(${v})`, kind: "insertBefore", line: line + 1, text: `${indentOf(lines[line])}assertSingleCustomer(${v});` } : undefined;
  return { line, why, fix };
}

// ---------- logging ----------
const LOGGER: Record<string, string> = { log: "info", info: "info", debug: "info", warn: "warn", error: "error" };
const CONSOLE_RE = /\bconsole\.(log|info|warn|error|debug)\(/;
const LOG_CALL = /\b(console|logger|log)\.(log|info|warn|error|debug|trace)\s*\(/;
const PII_FIELDS = "email|emailAddress|email_address|phone|phoneNumber|phone_number|fullName|full_name|firstName|first_name|lastName|last_name|ssn|payout_account|payoutAccount|bank_account|bankAccount|home_address|homeAddress";
const PII = new RegExp(`\\b(?:(\\w+)\\.)?(${PII_FIELDS})\\b|\\bexpert\\w*\\.name\\b`, "i");
const PII_ACCESS = new RegExp(`\\b(\\w+)\\.(?:${PII_FIELDS}|name)\\b`, "g");
const PII_KEY = new RegExp(`\\b(?:${PII_FIELDS})\\s*:`, "g");

/** The log call starting on line i, up to its closing paren (max 6 lines). */
function callText(lines: string[], i: number): string {
  let depth = 0;
  let out = "";
  for (let k = i; k < Math.min(lines.length, i + 6); k++) {
    const s = k === i ? lines[k].slice(lines[k].search(LOG_CALL)) : lines[k];
    for (const ch of s) {
      out += ch;
      if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) return out;
    }
    out += "\n";
  }
  return out;
}

// ---------- money ----------
const MONEY_WORD = /payout|amount|price|total|cost|fee|cents|dollar|balance|earning|salary|wage|invoice|\bpay\b/i;
type MoneyCheck = [RegExp, string, ((s: string, re: RegExp) => string)?];
const MONEY: MoneyCheck[] = [
  [/\b\w*cents\w*\s*\/\s*100(?:\.0+)?\b/i, "Converts integer cents to float dollars.", (s) => s.replace(/(\b\w*cents\w*)\s*\/\s*100(?:\.0+)?\b/i, "$1")],
  [/\bparseFloat\s*\(/, "Parses money as a float."],
  [/\.toFixed\s*\(\s*\d\s*\)/, "Rounds money as a float."],
  [/\b(?:const|let|var)\s+\w*[dD]ollars?\b|\b\w*[dD]ollars?\s*:/, "Stores money in dollars, not integer cents."],
  [/\b\w*(?:payout|amount|price|total|cost|fee)\w*\s*[:=]\s*-?\d+\.\d+/i, "Uses a decimal number for money."],
  [/\*\s*0?\.01\b|\/\s*100\.0\b/, "Converts money to float dollars."],
];
