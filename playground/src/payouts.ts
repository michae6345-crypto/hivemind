// Payout math. Everything is integer amount_cents end to end; dollars only exist in the UI.
import { db, type Payout, type TenantId } from "./db.js";
import { hmacExpertId, logger } from "./logger.js";

/** Rate card per task kind, in cents. */
const RATE_CENTS = { label: 125, review: 300 } as const;

export function payoutCents(tasks: { kind: keyof typeof RATE_CENTS }[], bonusCents = 0): number {
  return tasks.reduce((sum, t) => sum + RATE_CENTS[t.kind], 0) + bonusCents;
}

export async function pendingPayouts(tenantId: TenantId): Promise<Payout[]> {
  return db.forTenant(tenantId).query<Payout>(`SELECT * FROM payouts WHERE tenant_id = $1 AND status = 'pending'`);
}

export async function recordPayout(tenantId: TenantId, expertId: string, amountCents: number, traceId: string) {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error("amount_cents must be a non-negative integer");
  await db
    .forTenant(tenantId)
    .query(`INSERT INTO payouts (tenant_id, expert_id, amount_cents, status) VALUES ($1, $2, $3, 'pending')`, [expertId, amountCents]);
  logger.info("payout recorded", { trace_id: traceId, tenant_id: tenantId, expert: hmacExpertId(expertId), amount_cents: amountCents });
}
