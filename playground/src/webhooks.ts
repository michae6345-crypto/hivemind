// Stripe webhooks. payout.paid can arrive more than once, so event.id is recorded in processed_webhooks in the same
// transaction as the payout update, and a duplicate returns early (lesson from @ben).
import { db } from "./db.js";
import { logger } from "./logger.js";

type StripeEvent = { id: string; type: string; data: { object: { metadata: { payout_id: string; tenant_id: string } } } };

export async function handleStripeEvent(event: StripeEvent, traceId: string): Promise<"processed" | "duplicate" | "ignored"> {
  if (event.type !== "payout.paid" && event.type !== "transfer.created") return "ignored";
  const { payout_id, tenant_id } = event.data.object.metadata;
  return db.transaction(async (tx) => {
    const inserted = await tx.query(`INSERT INTO processed_webhooks (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`, [event.id]);
    if (!inserted.length) return "duplicate";
    await tx.query(`UPDATE payouts SET status = 'paid' WHERE tenant_id = $1 AND id = $2`, [tenant_id, payout_id]);
    logger.info("payout paid", { trace_id: traceId, tenant_id, payout_id, stripe_event: event.id });
    return "processed";
  });
}
