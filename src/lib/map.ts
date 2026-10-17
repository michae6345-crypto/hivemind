import type { Memory, Scope, Person, ActivityItem } from "@/contracts";

// DB row (snake_case) → contract (camelCase) mappers. Shared by all API routes.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function toMemory(r: any): Memory {
  return {
    id: r.id,
    scopeId: r.scope_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    slug: r.slug ?? r.id,
    locked: !!r.locked,
    status: r.status,
    source: r.source === "seed" ? "human" : r.source,
    author: r.author ?? "unknown",
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    alpha: Number(r.alpha),
    beta: Number(r.beta),
    expiresAt: r.expires_at,
    invalidatedBy: r.invalidated_by,
    blockedReason: r.status_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toScope(r: any): Scope {
  return { id: r.id, level: r.level, name: r.name, parentId: r.parent_id, owner: r.owner };
}

export function toPerson(r: any): Person {
  return { id: r.id, name: r.name, role: r.role, scopeId: r.scope_id ?? "org", title: r.title ?? "" };
}

export function toActivity(r: any): ActivityItem {
  return {
    id: String(r.id),
    sessionId: r.session_id,
    actor: r.actor ?? "unknown",
    repo: r.repo ?? "",
    file: r.file,
    createdAt: r.created_at,
    ...(r.agent ? { agent: r.agent } : {}),
  };
}

/** Scope chain from a scope up to org, e.g. repo/export-service → team/data-pipelines → org. */
export function scopeChain(scopeId: string, scopes: Pick<Scope, "id" | "parentId">[]): string[] {
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const out: string[] = [];
  let cur: string | null | undefined = scopeId;
  while (cur && !out.includes(cur)) {
    out.push(cur);
    cur = byId.get(cur)?.parentId;
  }
  return out;
}
