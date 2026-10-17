import "server-only";
import type { Candidate, Extraction } from "./extract";

// Learning from FIXES: someone changes code an AI agent (or another person) wrote → the convention that fix enforces
// becomes a pending lesson. This file parses the fix payload and holds the deterministic fallback; the LLM prompt is
// FIX_SYSTEM in prompts.ts and the pipeline wiring is in pipeline.ts (input.type === "fix").

export type Fix = {
  file: string;
  diff: string; // unified diff, capped at 4KB
  before?: string;
  after?: string;
  previousAuthor?: string; // "agent:claude-code" | "@kevin"
  violationRuleId?: string; // memory id or slug the fix resolves
  url?: string; // permalink to the fix (commit/PR line)
  line?: number; // first changed line in the new file
  removed: string[];
  added: string[];
};

const MAX_DIFF = 4096;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

export function parseFix(payload: Record<string, unknown>): Fix | null {
  const file = str(payload.file)?.replace(/\\/g, "/");
  let diff = str(payload.diff) ?? "";
  const before = str(payload.before);
  const after = str(payload.after);
  if (!diff && before !== undefined && after !== undefined) {
    diff = [...before.split("\n").map((l) => `-${l}`), ...after.split("\n").map((l) => `+${l}`)].join("\n");
  }
  if (!file || !diff) return null;
  diff = diff.slice(0, MAX_DIFF);
  const { removed, added, firstLine } = diffLines(diff);
  const line = Number.isInteger(Number(payload.line)) && Number(payload.line) > 0 ? Number(payload.line) : (firstLine ?? undefined);
  return {
    file, diff, before, after, removed, added, line,
    previousAuthor: str(payload.previousAuthor),
    violationRuleId: str(payload.violationRuleId),
    url: str(payload.url),
  };
}

/** Removed/added lines and the first changed line number in the new file (from the @@ hunk header). */
export function diffLines(diff: string): { removed: string[]; added: string[]; firstLine: number | null } {
  const removed: string[] = [];
  const added: string[] = [];
  let newLine: number | null = null;
  let firstLine: number | null = null;
  for (const l of diff.split(/\r?\n/)) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) {
      newLine = Number(h[1]);
      continue;
    }
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) {
      added.push(l.slice(1));
      firstLine ??= newLine;
      if (newLine !== null) newLine++;
    } else if (l.startsWith("-")) {
      removed.push(l.slice(1));
      firstLine ??= newLine;
    } else if (newLine !== null) newLine++;
  }
  return { removed, added, firstLine };
}

/** "src/export.ts:23" */
export const where = (f: Pick<Fix, "file" | "line">) => `${f.file}${f.line ? `:${f.line}` : ""}`;

/** Short diff excerpt for evidence quotes: changed lines only, max 6 lines / 300 chars. */
export function excerpt(f: Fix): string {
  const lines = [...f.removed.map((l) => `- ${l.trim()}`), ...f.added.map((l) => `+ ${l.trim()}`)].filter((l) => l.length > 2);
  return lines.slice(0, 6).join("\n").slice(0, 300);
}

/** Text handed to the LLM. */
export function describeFix(f: Fix): string {
  return [`FILE: ${f.file}${f.line ? ` (line ${f.line})` : ""}`, `PREVIOUSLY WRITTEN BY: ${f.previousAuthor ?? "unknown"}`, "DIFF:", f.diff].join("\n");
}

// ---------- cosmetic filter (no LLM) ----------
const COMMENT = /^\s*(\/\/|#|\*|\/\*|<!--)/;
const norm = (lines: string[]) =>
  lines
    .filter((l) => !COMMENT.test(l))
    .join("")
    .replace(/\s+/g, "")
    .replace(/["'`;]/g, "")
    .replace(/,(?=[)\]}])/g, "");

/** Formatting, comment/typo-only, import reordering, or renaming a symbol the diff itself declares. */
export function isCosmetic(f: Fix): boolean {
  const r = norm(f.removed);
  const a = norm(f.added);
  if (r === a) return true; // whitespace, quotes, semicolons, trailing commas, comments only
  if ([...f.removed, ...f.added].every((l) => COMMENT.test(l) || !l.trim())) return true;
  if (r.length && r.split("").sort().join("") === a.split("").sort().join("") && f.removed.every((l) => /^\s*import\b/.test(l))) return true;
  // Rename of a locally declared symbol: identical shape once that one identifier is swapped.
  const decl = f.removed.join("\n").match(/\b(?:const|let|var|function|class|def)\s+([A-Za-z_]\w*)/);
  const declNew = f.added.join("\n").match(/\b(?:const|let|var|function|class|def)\s+([A-Za-z_]\w*)/);
  if (decl && declNew && decl[1] !== declNew[1]) {
    const swapped = norm(f.removed.map((l) => l.replace(new RegExp(`\\b${decl[1]}\\b`, "g"), declNew[1])));
    if (swapped === a) return true;
  }
  return false;
}

// ---------- deterministic fallback ----------
const LOG_CALL = /\b(console\.\w+|logger\.\w+|log\.\w+|print|logging\.\w+)\s*\(/;
const PII = /\b(email|e_mail|phone|ssn|address|full_?name|dob|birth|password)\b/i;
const calls = (lines: string[]) => new Set(lines.flatMap((l) => [...l.matchAll(/([A-Za-z_][\w.]*)\s*\(/g)].map((m) => m[1])));

export function heuristicFixExtract(f: Fix): Extraction {
  const out: Candidate[] = [];
  const add = (title: string, body: string, scope: Candidate["scope"]) => out.push({ title, body, kind: "lesson", scope, confidence: 0.8 });
  const rem = f.removed.join("\n");
  const addn = f.added.join("\n");

  // PII leaving the logs: console.log(user.email) → logger.info({ expertId: user.id })
  const piiField = f.removed.filter((l) => LOG_CALL.test(l)).join("\n").match(PII)?.[1];
  if (piiField && !f.added.some((l) => LOG_CALL.test(l) && PII.test(l))) {
    const idName = addn.match(/\b([a-z]+)Id\b/)?.[1];
    const who = idName ? `${idName} ids` : "ids";
    add(`Log ${who}, never ${piiField.toLowerCase()}s`, `Logs must not contain personal info such as ${piiField.toLowerCase()}; log ${who} instead.`, "team");
  }
  // console.* → logger
  if (/\bconsole\.\w+\s*\(/.test(rem) && /\blogger\.\w+\s*\(/.test(addn) && !/\bconsole\.\w+\s*\(/.test(addn)) {
    add("Use logger, not console.log", "Use the shared logger instead of console.* in application code.", "team");
  }
  // A call swapped for another one (writeFile → safeWrite) or a new guard call added before existing code
  if (out.length < 2) {
    const r = calls(f.removed);
    const a = calls(f.added);
    const gone = [...r].filter((c) => !a.has(c) && !/^console\./.test(c));
    const fresh = [...a].filter((c) => !r.has(c) && !/^logger\./.test(c));
    const guard = fresh.find((c) => /^(assert|validate|ensure|check|require|verify)/i.test(c.split(".").pop() ?? ""));
    if (guard) add(`Call ${guard}() before ${/\b(write|save|send|insert|upload)\w*\s*\(/i.test(f.diff) ? "writing" : "continuing"} in ${f.file.split("/").pop()}`, `A fix added ${guard}() here; agents should include it.`, "repo");
    else if (gone.length === 1 && fresh.length === 1) add(`Use ${fresh[0]}() instead of ${gone[0]}()`, `A fix replaced ${gone[0]}() with ${fresh[0]}().`, "repo");
  }
  return { isCorrection: out.length > 0, candidates: out.slice(0, 2), ratings: [], path: "heuristic" };
}
