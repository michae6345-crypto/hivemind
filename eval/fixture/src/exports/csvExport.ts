import type { ExportRow } from "./types";
import { loadBatch } from "./rows";
import { upload } from "./sink";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ExportRow[]): string {
  const header = ["id", "batch_id", "prompt", "response", "rating"];
  const lines = rows.map((r) => [r.id, r.batchId, r.prompt, r.response, r.rating].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}

export async function exportCsv(jobId: string, batchId: string): Promise<string> {
  const rows = await loadBatch(batchId);
  console.log("exporting", rows.length, "rows for job", jobId);
  return upload(`${jobId}.csv`, toCsv(rows));
}
