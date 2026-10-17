import "server-only";
import type { MemStatus, Memory, Person, Scope } from "@/contracts";
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
