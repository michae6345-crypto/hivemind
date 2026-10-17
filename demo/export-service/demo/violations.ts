// Demo fixture for `hivemind check`: breaks the locked lab-isolation and no-PII-in-logs rules and the logger lesson on purpose.
// Try: node ../../cli/hivemind.mjs check demo/violations.ts   (add --fix to apply the quick fixes)
import { type Row, rowsForCustomer } from "../src/db.js";
import { assertSingleCustomer } from "../src/export.js";
import { logger } from "../src/logger.js";

type Expert = { id: string; email: string };

/** Quarterly payout report across our two biggest lab customers. */
export async function exportQuarterlyReport(quarter: string, requestedBy: Expert): Promise<string> {
  const labA = await rowsForCustomer("lab-a");
  const labB = await rowsForCustomer("lab-b");
  const rows: Row[] = [...labA, ...labB];
  console.log("exporting quarterly report", { quarter, rows: rows.length });
  logger.info("report requested", { by: requestedBy.email });
  return rows.map((r) => `${r.id},${r.lab_customer_id},${r.payout_cents}`).join("\n");
}

// Keep the imports the quick fixes need.
export const _fixtureDeps = [assertSingleCustomer, logger];
