// DELIBERATELY BROKEN, for `hivemind check scratch/legacy-report.ts`. An old quarterly report from before the team's
// rules. Run `hivemind check scratch/legacy-report.ts --fix`, then `git checkout -- scratch/` to break it again.
import { db, type Payout } from "../src/db.js";
import { logger } from "../src/logger.js";

type Expert = { id: string; email: string };

export async function exportQuarterlyPayouts(quarter: string, requestedBy: Expert): Promise<string> {
  const labA = await db.forTenant("lab-a").query<Payout>(`SELECT * FROM payouts WHERE tenant_id = $1`);
  const labB = await db.forTenant("lab-b").query<Payout>(`SELECT * FROM payouts WHERE tenant_id = $1`);
  const rows: Payout[] = [...labA, ...labB];
  console.log("exporting quarterly payouts", { quarter, rows: rows.length });
  logger.info("report requested", { trace_id: quarter, tenant_id: "all", by: requestedBy.email });
  const totalDollars = rows.reduce((sum, r) => sum + r.amount_cents / 100, 0);
  return `${quarter},${rows.length},${totalDollars.toFixed(2)}`;
}
