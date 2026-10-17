import { rowsForCustomer, type Row } from "./db.js";
import { logger } from "./logger.js";

export type ExportJob = { jobId: string; customerId: string };

/** Throws if rows from more than one lab customer are present. */
export function assertSingleCustomer(rows: Row[]): void {
  const ids = new Set(rows.map((r) => r.lab_customer_id));
  if (ids.size > 1) throw new Error(`export mixes lab customers: ${[...ids].join(", ")}`);
}

export async function buildExport(job: ExportJob): Promise<string> {
  const rows = await rowsForCustomer(job.customerId);
  assertSingleCustomer(rows);
  const totalCents = rows.reduce((sum, r) => sum + r.payout_cents, 0);
  logger.info("export built", { jobId: job.jobId, rows: rows.length, totalCents });
  return rows.map((r) => JSON.stringify({ id: r.id, prompt: r.prompt, response: r.response })).join("\n");
}
