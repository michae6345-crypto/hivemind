import "server-only";
import { createHash } from "node:crypto";
import type { Memory, Person } from "@/contracts";
import { caller, err } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeChain, toMemory, toPerson } from "@/lib/map";
import { normRepo, wilsonLB } from "@/lib/engine/pack";
import type { RulesResponse, Violation, VsRule } from "./types";

// Shared by /api/vscode/{rules,check,complete}: auth, scope-chain rule loading/ranking, wording, and the
// tiny function-signature parser the regex fast paths use.

/** Bearer-token gate (same as the hook routes). Returns the user or a 401 response. */
export function auth(req: Request, userParam?: string | null): { user: string } | Response {
  const c = caller(req);
  if (process.env.HIVEMIND_TOKEN && !c.viaToken) return err("bad token", 401);
  return { user: (userParam || c.user).toLowerCase() };
}

// ---------- wording (public/brand/vscode/wording.md) ----------
const ROLE_WORD: Record<string, string> = { security: "Security", lead: "Lead", engineer: "Engineer" };
const isAgent = (id: string) => id.startsWith("agent");
export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

export function violationMessage(r: VsRule, explanation?: string): string {
  const base = r.locked
    ? `Breaks a locked rule: ${r.title}. Locked by ${r.ownerFirst}, ${r.ownerRole}.`
    : `Doesn't follow a team lesson: ${r.title}. From ${r.ownerFirst}'s lesson.`;
  return explanation ? `${base} ${clip(explanation, 100)}` : base;
}

export function violation(r: VsRule, startLine: number, endLine: number, source: Violation["source"], fix?: Violation["fix"], explanation?: string): Violation {
  return {
    ruleId: r.id, ruleSlug: r.slug, ruleTitle: r.title, locked: r.locked, owner: r.owner,
    startLine, endLine, message: violationMessage(r, explanation), severity: r.locked ? "error" : "warning", source,
    ...(fix ? { fix } : {}),
  };
}

// ---------- rule loading ----------
const SPECIFICITY: Record<string, number> = { repo: 1, personal: 1, team: 0.85, org: 0.7 };
const specificity = (scopeId: string) => SPECIFICITY[scopeId.split("/")[0]] ?? 0.7;
// Stems that are also code keywords or everyday words ("Every export must…") don't count as naming the file.
const GENERIC_STEMS = new Set([
  "index", "utils", "util", "main", "types", "test", "tests", "config", "readme", "package",
  "export", "import", "default", "server", "client", "model", "models", "schema", "query", "queries", "logger",
  "handler", "route", "routes", "page", "layout", "service", "worker", "upload", "uploads", "migration", "migrations",
]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Same idea as activity/record.ts ruleHits: full path, basename, or a distinctive stem. */
export function fileMatcher(file: string): (text: string) => boolean {
  const f = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!f) return () => false;
  const name = f.split("/").pop() ?? f;
  const stem = name.replace(/\.[^.]+$/, "");
  const patterns = [new RegExp(esc(f), "i"), new RegExp(`(^|[^\\w.])${esc(name)}\\b`, "i")];
  if (stem.length >= 5 && !GENERIC_STEMS.has(stem.toLowerCase())) patterns.push(new RegExp(`(?<![\\w/-])${esc(stem)}(?![\\w-])`, "i"));
  return (text) => patterns.some((p) => p.test(text));
}

/** Code identifiers in `backticks`: `assertSingleCustomer(rows)` → assertSingleCustomer, keeps `console.log`. */
export function symbolsOf(text: string): string[] {
  const out = new Set<string>();
  for (const [, raw] of text.matchAll(/`([^`\n]+)`/g)) {
    const s = raw.trim().replace(/\(.*\)$/, "");
    if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(s) && s.length > 3) out.add(s); // drops `pii`-style schema names
  }
  return [...out];
}

function toVsRule(m: Memory, people: Map<string, Person>, matches: (t: string) => boolean): VsRule {
  const p = people.get(m.author);
  const agent = isAgent(m.author) || !p;
  const first = (id: string) => (isAgent(id) ? "An agent" : (people.get(id)?.name ?? id).split(" ")[0]);
  const ev = m.evidence[0];
  const learnedFrom =
    ev?.type === "correction" ? `${first(ev.actor)} corrected an agent: "${clip(ev.quote, 90)}"`
    : ev?.type === "review_comment" ? `${first(ev.actor)} in code review: "${clip(ev.quote, 90)}"`
    : null;
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    summary: clip(m.body, 320),
    scopeId: m.scopeId,
    kind: m.kind,
    locked: m.locked,
    status: m.status === "pending" ? "pending" : "active",
    owner: agent ? "an agent" : m.locked && p.title ? `${p.name}, ${p.title}` : p.name,
    ownerId: m.author,
    ownerFirst: agent ? "An agent" : p.name.split(" ")[0],
    ownerRole: agent ? "Agent" : (ROLE_WORD[p.role] ?? "Engineer"),
    taughtAt: ev?.at || m.createdAt,
    learnedFrom,
    evidenceCount: m.evidence.length,
    confidence: m.locked ? 1 : Math.round(wilsonLB(m.alpha, m.beta) * 1000) / 1000,
    mentionsFile: matches(`${m.title}\n${m.body}`),
    symbols: symbolsOf(`${m.title}\n${m.body}`),
  };
}

const score = (r: VsRule) => r.confidence * specificity(r.scopeId);
const byRank = (a: VsRule, b: VsRule) =>
  Number(b.locked) - Number(a.locked) || Number(b.mentionsFile) - Number(a.mentionsFile) || score(b) - score(a);

export type RuleCtx = {
  repo: string;
  /** Active (non-expired) rules in the chain, ranked; includes kind "owner". */
  all: VsRule[];
  /** What the editor shows / checks against: `all` minus owner entries (unless they mention the file). */
  rules: VsRule[];
  pending: VsRule[];
  approver: RulesResponse["approver"];
  /** ids + updatedAt of the active rules, for cache keys. */
  sig: string;
};

// Short TTL so a burst of check/complete calls shares one DB read, but an approval shows up within seconds.
const CTX_TTL_MS = 3000;
const ctxCache = new Map<string, { at: number; ctx: Promise<RuleCtx> }>();

export function loadRules(repoIn: string, user: string, file = ""): Promise<RuleCtx> {
  const key = `${repoIn}|${user}|${file}`;
  const hit = ctxCache.get(key);
  if (hit && Date.now() - hit.at < CTX_TTL_MS) return hit.ctx;
  const ctx = fetchRules(repoIn, user, file);
  ctxCache.set(key, { at: Date.now(), ctx });
  ctx.catch(() => ctxCache.delete(key));
  if (ctxCache.size > 100) ctxCache.delete(ctxCache.keys().next().value!);
  return ctx;
}

async function fetchRules(repoIn: string, user: string, file: string): Promise<RuleCtx> {
  const sb = db();
  const repoId = normRepo(repoIn);
  const [{ data: scopeRows }, { data: peopleRows }] = await Promise.all([
    sb.from("scopes").select("id, parent_id, owner"),
    sb.from("people").select("*"),
  ]);
  const scopes = (scopeRows ?? []).map((s) => ({ id: s.id as string, parentId: s.parent_id as string | null, owner: s.owner as string | null }));
  const people = new Map((peopleRows ?? []).map((r) => [r.id as string, toPerson(r)]));
  const known = new Set(scopes.map((s) => s.id));

  // Mirrors buildPack: repo → team → org; unknown repo → the user's home chain. Plus personal/<user>.
  const base = repoId && known.has(repoId) ? repoId : (people.get(user)?.scopeId ?? "org");
  const chain = scopeChain(base, scopes);
  if (!chain.includes("org")) chain.push("org");
  const personal = `personal/${user}`;
  if (known.has(personal) && !chain.includes(personal)) chain.push(personal);

  const { data, error } = await sb.from("memories").select("*").in("scope_id", chain).in("status", ["active", "pending"]);
  if (error) throw new Error(error.message);
  const now = new Date().toISOString();
  const mems = (data ?? []).map(toMemory).filter((m) => !m.expiresAt || m.expiresAt > now);
  const matches = fileMatcher(file);

  const activeMems = mems.filter((m) => m.status === "active");
  const all = activeMems.map((m) => toVsRule(m, people, matches)).sort(byRank);
  const pending = mems
    .filter((m) => m.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => toVsRule(m, people, matches))
    .sort((a, b) => score(b) - score(a));

  const ownerId = chain.map((id) => scopes.find((s) => s.id === id)).find((s) => s?.owner && !s.id.startsWith("personal/"))?.owner;
  const owner = ownerId ? people.get(ownerId) : undefined;
  const sig = activeMems.map((m) => `${m.id}@${m.updatedAt}`).sort().join(",");

  return {
    repo: repoId || base,
    all,
    rules: all.filter((r) => r.kind !== "owner" || r.mentionsFile),
    pending,
    approver: owner ? { id: owner.id, name: owner.name } : null,
    sig,
  };
}

// ---------- misc ----------
export const sha256 = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");

/** Bounded insertion-ordered cache (drops oldest). */
export function lru<V>(max: number) {
  const m = new Map<string, V>();
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: V) => {
      m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value!);
    },
  };
}

// ---------- function signatures (regex fast paths) ----------
export const DATA_FN = /export|write|build|dump|upload/i;
export const DATA_PARAM = /^(rows|records|items|data)$/;
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "with", "else", "do", "try", "new", "await", "typeof"]);
const SIG_RES = [
  /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\s*\(/,
  /^(\s*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\s*\*?\s*[\w$]*\s*)?(?:<[^(]*>)?\(/,
  /^(\s*)(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\(/,
];

export type Sig = {
  line: number; // line of the name
  indent: string;
  name: string;
  params: string[];
  /** Line + column of the body `{` (null for expression-bodied arrows / unfinished signatures). */
  braceLine: number | null;
  braceCol: number;
};

/** Parse a function/method signature starting at `lines[i]` (params may span up to 8 lines). */
export function parseSig(lines: string[], i: number): Sig | null {
  let m: RegExpMatchArray | null = null;
  for (const re of SIG_RES) if ((m = lines[i].match(re))) break;
  if (!m || KEYWORDS.has(m[2])) return null;
  const isMethod = !/\bfunction\b|\b(const|let|var)\b/.test(m[0]);
  // Walk from the "(" to its ")", then to the body "{" (or "=>" without "{", or ";" for a call).
  let depth = 0, angle = 0, li = i, col = m[0].length - 1, closed = false;
  const params: string[] = [];
  let cur = "";
  for (; li < Math.min(lines.length, i + 8); li++, col = 0) {
    const s = lines[li];
    for (; col < s.length; col++) {
      const ch = s[col];
      if (!closed) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        if (depth === 0) { closed = true; params.push(cur); continue; }
        if (depth === 1 && ch === ",") { params.push(cur); cur = ""; }
        else if (!(depth === 1 && ch === "(")) cur += ch;
        continue;
      }
      if (ch === "<") angle++;
      else if (ch === ">" && s[col - 1] !== "=") angle = Math.max(0, angle - 1);
      else if (ch === ";" && angle === 0) return null;
      else if (ch === "{" && angle === 0) {
        if (isMethod && !/^\s*(?::[^{]*)?$/.test(s.slice(0, col).replace(/^.*\)/, ""))) return null; // a call like foo(x) { ... } isn't a method
        return { line: i, indent: m[1], name: m[2], params: params.map(paramName).filter(Boolean), braceLine: li, braceCol: col };
      }
    }
    if (closed && isMethod && li > i) break;
  }
  if (!closed) return null;
  return isMethod ? null : { line: i, indent: m[1], name: m[2], params: params.map(paramName).filter(Boolean), braceLine: null, braceCol: 0 };
}

const paramName = (p: string) => p.trim().replace(/^\.\.\./, "").match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? "";

/** Index (line) of the `}` closing the body that opens at (line, col); lines.length - 1 if unclosed (still typing). */
export function bodyEnd(lines: string[], line: number, col: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let li = line; li < lines.length; li++) {
    const s = lines[li];
    for (let c = li === line ? col : 0; c < s.length; c++) {
      const ch = s[c];
      if (quote) { if (ch === "\\") c++; else if (ch === quote) quote = null; continue; }
      if (ch === "/" && s[c + 1] === "/") break;
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return li;
    }
    quote = null; // template literals aren't tracked: their ${} braces balance anyway
  }
  return lines.length - 1;
}

export const indentOf = (s: string) => s.match(/^\s*/)?.[0] ?? "";
