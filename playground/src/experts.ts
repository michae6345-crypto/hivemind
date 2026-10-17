// Payout emails to experts. Names and emails come from the pii schema and must never reach a log line, trace or
// error message (locked rule, @greg): log hmacExpertId(expert.id) instead.
import { hmacExpertId, logger } from "./logger.js";

export type Expert = { id: string; name: string; email: string };

type Mailer = { send(to: string, subject: string, body: string): Promise<void> };

export async function sendPayoutEmail(mailer: Mailer, expert: Expert, amountCents: number, ctx: { trace_id: string; tenant_id: string }) {
  const dollars = (amountCents / 100).toFixed(2); // formatting for the email body only
  await mailer.send(expert.email, "Your Meridian payout is on its way", `Hi ${expert.name}, we sent you $${dollars}.`);
  logger.info("payout email sent", { ...ctx, expert: hmacExpertId(expert.id) });
}
