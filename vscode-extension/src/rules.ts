import * as vscode from "vscode";
import { api } from "./api";
import { relPath, repoFor } from "./config";
import type { RulesResponse, VsRule } from "./types";

// Per-file cache of GET /api/vscode/rules. Refreshed on open/focus and every REFRESH_MS for the active file, so an
// approval in the web app shows up in the status bar / CodeLens within seconds.
const TTL_MS = 8000;

type Entry = { at: number; data: RulesResponse | null; inflight?: Promise<RulesResponse | null> };
const cache = new Map<string, Entry>();
const changed = new vscode.EventEmitter<void>();
export const onRulesChanged = changed.event;

const keyOf = (doc: vscode.TextDocument) => `${repoFor(doc.uri)}|${relPath(doc.uri)}`;

/** Cached rules for a document (may be stale/null); never blocks. */
export function peekRules(doc: vscode.TextDocument): RulesResponse | null {
  return cache.get(keyOf(doc))?.data ?? null;
}

export async function rulesFor(doc: vscode.TextDocument, force = false): Promise<RulesResponse | null> {
  const key = keyOf(doc);
  const hit = cache.get(key);
  if (hit?.inflight) return hit.inflight;
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.data;
  const inflight = api.rules(repoFor(doc.uri), relPath(doc.uri)).then((data) => {
    const prev = cache.get(key)?.data;
    // keep the last good answer if the server blips
    cache.set(key, { at: Date.now(), data: data ?? prev ?? null });
    if (data && signature(data) !== (prev ? signature(prev) : "")) changed.fire();
    return data ?? prev ?? null;
  });
  cache.set(key, { at: hit?.at ?? 0, data: hit?.data ?? null, inflight });
  return inflight;
}

const signature = (r: RulesResponse) =>
  `${r.rules.map((x) => `${x.id}:${x.status}:${x.locked}:${x.taughtAt}`).join(",")}|${r.pending.count}|${r.approver?.id ?? ""}`;

export function clearRules() {
  cache.clear();
  changed.fire();
}

// ---------- relevance ----------

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const symRe = new Map<string, RegExp>();
function symbolRegex(sym: string): RegExp {
  let re = symRe.get(sym);
  if (!re) {
    re = new RegExp(`(?<![\\w$.])${esc(sym)}(?![\\w$])`);
    symRe.set(sym, re);
  }
  return re;
}

/** Symbols of `rule` that occur in `text`. */
export function symbolsIn(rule: VsRule, text: string): string[] {
  return rule.symbols.filter((s) => s.length >= 3 && symbolRegex(s).test(text));
}

/** Rules that apply to a chunk of code: the rule names this file, or a symbol it names appears in the code. */
export function rulesApplying(rules: VsRule[], text: string, extraIds: Set<string> = new Set()): VsRule[] {
  return rules.filter((r) => extraIds.has(r.id) || r.mentionsFile || symbolsIn(r, text).length > 0);
}

export type FnSpan = { name: string; line: number; endLine: number };

const FN_PATTERNS: RegExp[] = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/,
];
const NOT_FN = new Set(["if", "for", "while", "switch", "catch", "return", "function", "constructor"]);

/** Top-level-ish functions with their line spans (brace counting; indentation for Python). */
export function findFunctions(doc: vscode.TextDocument): FnSpan[] {
  const out: FnSpan[] = [];
  const py = doc.languageId === "python";
  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    let name: string | undefined;
    for (const re of FN_PATTERNS) {
      const m = re.exec(text);
      if (m && !NOT_FN.has(m[1])) {
        name = m[1];
        break;
      }
    }
    if (!name) continue;
    out.push({ name, line: i, endLine: py ? pyEnd(doc, i) : braceEnd(doc, i) });
  }
  return out;
}

function braceEnd(doc: vscode.TextDocument, start: number): number {
  let depth = 0;
  let opened = false;
  for (let i = start; i < doc.lineCount && i < start + 400; i++) {
    const t = doc.lineAt(i).text.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, "");
    for (const ch of t) {
      if (ch === "{") (depth++, (opened = true));
      else if (ch === "}") depth--;
    }
    if (opened && depth <= 0) return i;
    if (!opened && i > start + 3) return start; // arrow fn without braces
  }
  return start;
}

function pyEnd(doc: vscode.TextDocument, start: number): number {
  const indent = doc.lineAt(start).firstNonWhitespaceCharacterIndex;
  let end = start;
  for (let i = start + 1; i < doc.lineCount; i++) {
    const l = doc.lineAt(i);
    if (l.isEmptyOrWhitespace) continue;
    if (l.firstNonWhitespaceCharacterIndex <= indent) break;
    end = i;
  }
  return end;
}

// ---------- wording (public/brand/vscode/wording.md) ----------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `1 locked rule · 2 team lessons apply` (or `2 team lessons apply`). */
export function lensTitle(rules: VsRule[]): string {
  const locked = rules.filter((r) => r.locked).length;
  const lessons = rules.length - locked;
  const parts: string[] = [];
  if (locked) parts.push(plural(locked, "locked rule", "locked rules"));
  if (lessons) parts.push(plural(lessons, "team lesson", "team lessons"));
  const verb = rules.length === 1 ? "applies" : "apply";
  return `${locked ? "$(lock) " : ""}${parts.join(" · ")} ${verb}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** `Alex taught this on Oct 14. Applies to #org.` / `Maya locked this on Oct 12. …` */
export function provenance(r: VsRule): string {
  const when = shortDate(r.taughtAt);
  return `${r.ownerFirst} ${r.locked ? "locked" : "taught"} this${when ? ` on ${when}` : ""}. Applies to #${r.scopeId}.`;
}
