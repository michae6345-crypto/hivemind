import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Memory, Person, Scope } from "@/mocks/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Wilson lower bound (z = 1.96) on p = α/(α+β), n = α+β−2 — same formula as PLAN.md §5. */
export function confidence(m: Pick<Memory, "alpha" | "beta" | "locked">): number {
  if (m.locked) return 1;
  const n = m.alpha + m.beta - 2;
  if (n <= 0) return 0;
  const p = m.alpha / (m.alpha + m.beta);
  const z = 1.96;
  const z2 = z * z;
  const lb =
    (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
  return Math.max(0, Math.min(1, lb));
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function scopeChain(scopeId: string, scopes: Scope[]): Scope[] {
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const chain: Scope[] = [];
  let cur = byId.get(scopeId);
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain; // most specific first
}

export function scopeLabel(scopeId: string): string {
  return scopeId === "org" ? "#org" : `#${scopeId}`;
}

/** Who may approve/reject a memory in this scope (PLAN.md §4 role rules). */
export function canApprove(person: Person | undefined, memory: Memory, scopes: Scope[]): boolean {
  if (!person) return false;
  if (person.role === "security") return true;
  const chain = scopeChain(memory.scopeId, scopes).map((s) => s.id);
  if (person.role === "lead") return memory.scopeId !== "org" && chain.includes(person.scopeId);
  return memory.scopeId === `personal/${person.id}`;
}

export function approverFor(memory: Memory, scopes: Scope[], people: Person[]): Person | undefined {
  const chain = scopeChain(memory.scopeId, scopes);
  for (const s of chain) {
    if (s.level === "personal") continue;
    const owner = people.find((p) => p.id === s.owner);
    if (owner) return owner;
  }
  return people.find((p) => p.role === "security");
}

/** People whose agents load a lesson in this scope: everyone working at or below it,
 *  and for a repo, the team that owns the repo. */
export function reachFor(scopeId: string, scopes: Scope[], people: Person[]): number {
  if (scopeId.startsWith("personal/")) return 1;
  const s = scopes.find((x) => x.id === scopeId);
  const anchor = s?.level === "repo" ? (s.parentId ?? scopeId) : scopeId;
  return people.filter((p) => scopeChain(p.scopeId, scopes).some((c) => c.id === anchor)).length;
}

export function canLock(person: Person | undefined): boolean {
  return person?.role === "security";
}

// ── Tokens: [[slug]] #org #team/x #repo/x @person 🔒 ─────────────────────────

export const TOKEN_RE =
  /\[\[([a-z0-9][\w-]*)\]\]|#(org(?:\/[\w.-]+)?|(?:team|repo|personal)\/[\w.-]+)|@([a-z][\w-]*)|(🔒)/g;

export type TokenKind = "link" | "team" | "repo" | "org" | "person" | "lock";

export interface Token {
  kind: TokenKind;
  id: string; // slug, scope id, person id, or 'lock'
  text: string;
  from: number;
  to: number;
}

export function tokenKindForScope(id: string): "org" | "team" | "repo" {
  if (id === "org" || id.startsWith("org/")) return "org";
  if (id.startsWith("team/")) return "team";
  return "repo";
}

export function tokenize(text: string, personIds: Set<string>): Token[] {
  const out: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    const [full, slug, scope, person, lock] = m;
    const from = m.index;
    const to = from + full.length;
    if (slug) out.push({ kind: "link", id: slug, text: full, from, to });
    else if (scope) out.push({ kind: tokenKindForScope(scope), id: scope, text: full, from, to });
    else if (person && personIds.has(person)) out.push({ kind: "person", id: person, text: full, from, to });
    else if (lock) out.push({ kind: "lock", id: "lock", text: full, from, to });
  }
  return out;
}

export const STATUS_META: Record<
  Memory["status"],
  { label: string; className: string }
> = {
  active: { label: "Approved", className: "text-ok bg-ok/10" },
  pending: { label: "Waiting for approval", className: "text-[#9a6412] bg-honey/15" },
  blocked: { label: "Blocked", className: "text-danger bg-danger/10" },
  rejected: { label: "Rejected", className: "text-muted bg-fg/5" },
  invalid: { label: "Invalidated", className: "text-muted bg-fg/5 line-through" },
};
