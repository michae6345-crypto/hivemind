// Fake Postgres client for the playground. Tenant tables (tasks, exports, payouts) are only reachable through
// db.forTenant(tenantId), which adds the tenant_id filter for you. A bare db.query() on them fails review.

export type TenantId = "lab-a" | "lab-b";

export type Payout = { id: string; tenant_id: TenantId; expert_id: string; amount_cents: number; status: "pending" | "paid"; created_at: string };
export type Job = { id: string; tenant_id: TenantId; kind: "label" | "review"; status: "queued" | "running" | "done"; created_at: string };

type Row = Record<string, unknown>;
export type Tx = { query<T = Row>(sql: string, params?: unknown[]): Promise<T[]> };

const TENANT_TABLES = ["tasks", "exports", "payouts", "jobs"];

async function run<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  // The playground has no real database; pretend every statement succeeds.
  void sql;
  void params;
  return [];
}

export const db = {
  /** Untenanted tables only (processed_webhooks, migrations). */
  query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const table = TENANT_TABLES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(sql));
    if (table) throw new Error(`db.query() on tenant table "${table}": use db.forTenant(tenantId)`);
    return run<T>(sql, params);
  },

  /** Every statement gets `tenant_id = $1` prepended as its first parameter. Write `WHERE tenant_id = $1 AND …`. */
  forTenant(tenantId: TenantId) {
    return {
      query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
        if (!/tenant_id\s*=\s*\$1/i.test(sql)) throw new Error("forTenant queries must filter on tenant_id = $1");
        return run<T>(sql, [tenantId, ...params]);
      },
    };
  },

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return fn({ query: run });
  },
};
