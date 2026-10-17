import { err, json } from "@/lib/auth";
import { haikuJson, llmEnabled } from "../llm";
import { DATA_FN, DATA_PARAM, auth, bodyEnd, indentOf, loadRules, lru, parseSig, sha256, violation } from "../shared";
import type { CheckRequest, CheckResponse, QuickFix, Violation, VsRule } from "../types";

// POST /api/vscode/check { repo, file, text } → CheckResponse (squiggles + quick fixes).
// Pass 1: deterministic regex rules (instant). Pass 2: Haiku against the ranked rules, when a key is set.
const MAX_LLM_LINES = 400;
const cache = lru<CheckResponse>(200);

const LOGGER: Record<string, string> = { log: "info", info: "info", debug: "info", warn: "warn", error: "error" };
const CONSOLE_RE = /\bconsole\.(log|info|warn|error|debug)\(/;
const isComment = (s: string) => /^\s*(\/\/|\*|\/\*)/.test(s);

function regexPass(lines: string[], rules: VsRule[]): Violation[] {
  const out: Violation[] = [];

  // console.* → logger.* (use-logger lesson)
  const logRule = rules.find((r) => r.symbols.includes("console.log") || r.summary.includes("console.log") || r.title.includes("console.log"));
  if (logRule) {
    lines.forEach((s, i) => {
      const m = s.match(CONSOLE_RE);
      if (!m || isComment(s)) return;
      const fix: QuickFix = {
        title: `Fix: use logger.${LOGGER[m[1]]} instead of console.${m[1]}`,
        kind: "replaceLines",
        line: i,
        endLine: i,
        text: s.replace(new RegExp(CONSOLE_RE.source, "g"), (_, f: string) => `logger.${LOGGER[f]}(`),
      };
      out.push(violation(logRule, i, i, "regex", fix));
    });
  }

  // Export/write functions over rows that never call assertSingleCustomer (🔒 lab isolation)
  const ascRules = rules.filter((r) => r.symbols.includes("assertSingleCustomer"));
  const ascRule = ascRules.find((r) => r.locked) ?? ascRules[0];
  if (ascRule) {
    for (let i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      const sig = parseSig(lines, i);
      if (!sig || sig.braceLine === null || !DATA_FN.test(sig.name)) continue;
      const end = bodyEnd(lines, sig.braceLine, sig.braceCol);
      const body = [lines[sig.braceLine].slice(sig.braceCol), ...lines.slice(sig.braceLine + 1, end + 1)].join("\n");
      if (/\bassertSingleCustomer\s*\(/.test(body)) continue;

      let arg = sig.params.find((p) => DATA_PARAM.test(p));
      let at = sig.braceLine + 1;
      let indent = "";
      if (!arg) {
        // e.g. `const rows = await fetchRows()` inside the body → assert right after it
        const j = lines.findIndex((s, k) => k > sig.braceLine! && k < end && /\b(?:const|let|var)\s+(rows|records|items|data)\b/.test(s));
        if (j < 0) continue;
        arg = lines[j].match(/\b(?:const|let|var)\s+(rows|records|items|data)\b/)![1];
        at = j + 1;
        indent = indentOf(lines[j]);
      }
      if (!indent) {
        const firstBody = lines.slice(at, end).find((s) => s.trim());
        indent = firstBody ? indentOf(firstBody) : sig.indent + "  ";
      }
      const fix: QuickFix | undefined =
        end > sig.braceLine && at <= end ? { title: `Fix: add assertSingleCustomer(${arg})`, kind: "insertBefore", line: at, text: `${indent}assertSingleCustomer(${arg});` } : undefined;
      out.push(violation(ascRule, sig.line, sig.line, "regex", fix));
    }
  }
  return out;
}

type LlmOut = {
  violations: {
    ruleId: string;
    startLine: number;
    endLine: number;
    explanation: string;
    certain: boolean;
    fix: { title: string; kind: "insertBefore" | "replaceLines"; line: number; endLine: number | null; text: string } | null;
  }[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["violations"],
  properties: {
    violations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ruleId", "startLine", "endLine", "explanation", "certain", "fix"],
        properties: {
          ruleId: { type: "string" },
          startLine: { type: "integer" },
          endLine: { type: "integer" },
          explanation: { type: "string" },
          certain: { type: "boolean" },
          fix: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["title", "kind", "line", "endLine", "text"],
                properties: {
                  title: { type: "string" },
                  kind: { type: "string", enum: ["insertBefore", "replaceLines"] },
                  line: { type: "integer" },
                  endLine: { anyOf: [{ type: "integer" }, { type: "null" }] },
                  text: { type: "string" },
                },
              },
            ],
          },
        },
      },
    },
  },
};

const SYSTEM = `You check code against a software team's rules (their "team memory"). Report only CLEAR violations of the listed rules in the given file.
- Code that already complies is not a violation. Do not report style nits, rules that don't apply, or anything not covered by a listed rule.
- Only report what is visible in these lines: the code does something a rule forbids (e.g. console.log, floats for money) or omits a call a rule names. Do not report design concerns that would need other files or runtime context (idempotency, streaming, retries, ownership).
- False positives are much worse than misses: if unsure, leave it out. An empty list is the usual answer. At most 5 violations.
- Line numbers are the 1-based numbers shown before each line. startLine/endLine = the smallest range that shows the problem.
- explanation: one short sentence (under 15 words) on what this code does wrong.
- certain: true only if a reviewer who knows the rule would definitely flag these exact lines; otherwise false.
- fix (optional, null if unsure): "insertBefore" inserts \`text\` (full lines, with indentation) before \`line\`; "replaceLines" replaces lines line..endLine with \`text\`. title is a short imperative like "add assertSingleCustomer(rows)".`;

async function llmPass(file: string, lines: string[], rules: VsRule[]): Promise<Violation[] | null> {
  const shown = lines.slice(0, MAX_LLM_LINES);
  const ruleList = rules
    .slice(0, 15)
    .map((r) => `- id=${r.id} ${r.locked ? "🔒 LOCKED " : ""}"${r.title}": ${r.summary}`)
    .join("\n");
  const code = shown.map((s, i) => `${i + 1}| ${s}`).join("\n");
  const out = await haikuJson<LlmOut>(SYSTEM, `Rules:\n${ruleList}\n\nFile: ${file}\n${code}`, SCHEMA, { timeoutMs: 8000, maxTokens: 600 });
  if (!out || !Array.isArray(out.violations)) return null;

  const byId = new Map(rules.map((r) => [r.id, r]));
  const n = shown.length;
  const res: Violation[] = [];
  for (const v of out.violations.filter((x) => x.certain).slice(0, 5)) {
    const r = byId.get(v.ruleId) ?? rules.find((x) => x.slug === v.ruleId);
    const s = v.startLine - 1, e = (v.endLine ?? v.startLine) - 1;
    if (!r || !Number.isInteger(s) || s < 0 || e < s || e >= n) continue;
    let fix: QuickFix | undefined;
    const f = v.fix;
    if (f && f.text && Number.isInteger(f.line)) {
      const fl = f.line - 1, fe = (f.endLine ?? f.line) - 1;
      const ok = f.kind === "insertBefore" ? fl >= 0 && fl <= lines.length : fl >= 0 && fe >= fl && fe < lines.length;
      const action = f.title.replace(/^fix:\s*/i, "").trim();
      if (ok && action) {
        fix = { title: `Fix: ${action[0].toLowerCase()}${action.slice(1)}`, kind: f.kind, line: fl, text: f.text.replace(/\n$/, "") };
        if (f.kind === "replaceLines") fix.endLine = fe;
      }
    }
    res.push(violation(r, s, e, "llm", fix, v.explanation));
  }
  return res;
}

/** Regex hits win; an LLM hit is dropped if it repeats a regex hit (same rule, or a rule naming the same code symbol) on overlapping lines. */
function merge(regex: Violation[], llm: Violation[], rules: VsRule[]): Violation[] {
  const sym = new Map(rules.map((r) => [r.id, r.symbols]));
  const related = (a: string, b: string) => a === b || (sym.get(a) ?? []).some((s) => (sym.get(b) ?? []).includes(s));
  const out = [...regex];
  const seen = new Set(regex.map((v) => `${v.ruleId}:${v.startLine}`));
  for (const v of llm) {
    if (seen.has(`${v.ruleId}:${v.startLine}`)) continue;
    if (regex.some((x) => related(x.ruleId, v.ruleId) && x.startLine <= v.endLine + 2 && v.startLine <= x.endLine + 2)) continue;
    seen.add(`${v.ruleId}:${v.startLine}`);
    out.push(v);
  }
  return out.sort((a, b) => a.startLine - b.startLine || Number(b.locked) - Number(a.locked));
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const a = auth(req);
  if (a instanceof Response) return a;
  const body = (await req.json().catch(() => null)) as Partial<CheckRequest> | null;
  if (!body || typeof body.text !== "string") return err("expected { repo, file, text }");
  const file = String(body.file ?? "").replace(/\\/g, "/");
  try {
    const ctx = await loadRules(String(body.repo ?? ""), a.user, file);
    const rules = ctx.all.filter((r) => r.kind !== "owner");
    const key = sha256(ctx.repo, file, body.text, ctx.sig);
    const hit = cache.get(key);
    if (hit) return json({ ...hit, cached: true, ms: Date.now() - t0 } satisfies CheckResponse);

    const lines = body.text.split("\n").map((s) => s.replace(/\r$/, ""));
    const regex = regexPass(lines, rules);
    const llm = rules.length && llmEnabled() ? await llmPass(file, lines, rules) : [];
    const res: CheckResponse = { violations: merge(regex, llm ?? [], rules), cached: false, ms: Date.now() - t0 };
    if (llm !== null) cache.set(key, res); // don't pin a regex-only result after an LLM timeout
    return json(res);
  } catch (e) {
    return err(e instanceof Error ? e.message : "check failed", 500);
  }
}
