import { query } from "../db";
import type { ExportRow } from "./types";

export async function loadBatch(batchId: string): Promise<ExportRow[]> {
  return query<ExportRow>("select * from export_rows where batch_id = $1", [batchId]);
}
