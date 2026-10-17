import "server-only";
import type { MemStatus, Memory, Person, Scope } from "@/contracts";
import { canLock, canWrite, type Caller } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeChain, toMemory, toPerson, toScope } from "@/lib/map";

// Shared read helpers for API routes. All return contract shapes (camelCase).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data as T;
}

export async function getScopes(): Promise<Scope[]> {
  return must("scopes", await db().from("scopes").select("*").order("id")).map(toScope);
}

export async function getPeople(): Promise<Person[]> {
  return must("people", await db().from("people").select("*").order("id")).map(toPerson);
}

/** The caller's home scope (people.scope_id), or null for unknown users. */
export async function homeScopeOf(user: string): Promise<string | null> {
  const r = await db().from("people").select("scope_id").eq("id", user).maybeSingle();
  return must("people", r)?.scope_id ?? null;
}

export type MemoryFilter = { scope?: string | null; chain?: boolean; status?: string | null; q?: string | null };

/** List memories. `scope` = exact scope, or with `chain` the scope plus all ancestors. `status` may be a comma list. */
export async function listMemories(f: MemoryFilter = {}): Promise<Memory[]> {
  let query = db().from("memories").select("*").order("created_at", { ascending: false });
  if (f.scope) {
    const ids = f.chain ? scopeChain(f.scope, await getScopes()) : [f.scope];
    query = query.in("scope_id", ids);
  }
  if (f.status) query = query.in("status", f.status.split(",").map((s) => s.trim()) as MemStatus[]);
  const q = f.q?.replace(/[,()*%\\]/g, " ").trim(); // keep PostgREST or() syntax intact
  if (q) query = query.or(`title.ilike.*${q}*,body.ilike.*${q}*,slug.ilike.*${q}*`);
  return must("memories", await query).map(toMemory);
}

/** Raw DB row by uuid, slug, or UI mock id `mem-<slug>`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findMemoryRow(idOrSlug: string): Promise<any | null> {
  const col = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const val = col === "slug" ? idOrSlug.replace(/^mem-/, "") : idOrSlug;
  return must("memory", await db().from("memories").select("*").eq(col, val).maybeSingle());
}

// ---------- writes shared by POST /api/memories and approve/reject ----------

type EventRow = { type: string; actor: string; repo?: string | null; payload: Record<string, unknown> };

/** Best-effort events row (feed/metrics). Never fails the request. */
export async function logEvent(e: EventRow): Promise<void> {
  const { error } = await db().from("events").insert({ ...e, processed: true });
  if (error) console.error("events insert:", error.message);
}

export type Decision = "approve" | "reject";
export type DecideResult = { ok: true; memory: Memory } | { ok: false; status: number; error: string };

/**
 * Approve or reject a memory on behalf of `c`.
 * approve → active, alpha += 2, manual evidence; reject → rejected, beta += 1. Both log an events row.
 */
export async function decideMemory(c: Caller, idOrSlug: string, decision: Decision): Promise<DecideResult> {
  const row = await findMemoryRow(idOrSlug);
  if (!row) return { ok: false, status: 404, error: `memory ${idOrSlug} not found` };
  const [scopes, home] = await Promise.all([getScopes(), homeScopeOf(c.user)]);
  if (!canWrite(c, row.scope_id, home, scopes))
    return { ok: false, status: 403, error: `${c.role} ${c.user} cannot ${decision} memories in ${row.scope_id}` };
  if (row.locked && !canLock(c)) return { ok: false, status: 403, error: "locked memories can only be changed by security" };
  if (decision === "approve" && row.status === "blocked" && c.role !== "security")
    return { ok: false, status: 403, error: `blocked: ${row.status_reason ?? "conflicts with a locked rule"} (security only)` };
  const target = decision === "approve" ? "active" : "rejected";
  if (row.status === target) return { ok: false, status: 409, error: `memory is already ${target}` };

  const at = new Date().toISOString();
  const patch =
    decision === "approve"
      ? {
          status: "active",
          status_reason: null,
          alpha: Number(row.alpha) + 2,
          evidence: [...(row.evidence ?? []), { type: "manual", quote: `Approved by ${c.user}`, actor: c.user, at }],
          updated_at: at,
        }
      : { status: "rejected", beta: Number(row.beta) + 1, updated_at: at };
  const updated = must("memory", await db().from("memories").update(patch).eq("id", row.id).select("*").single());
  await logEvent({
    type: decision === "approve" ? "approval" : "rejection",
    actor: c.user,
    payload: { memoryId: row.id, slug: row.slug, title: row.title, scopeId: row.scope_id, role: c.role },
  });
  return { ok: true, memory: toMemory(updated) };
}
