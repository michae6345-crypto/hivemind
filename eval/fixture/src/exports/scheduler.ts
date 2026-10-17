import type { ExportJob } from "./types";
import { exportCsv } from "./csvExport";

const queue: ExportJob[] = [];

export function schedule(job: ExportJob) {
  queue.push(job);
}

export async function runScheduled(): Promise<string[]> {
  const urls: string[] = [];
  while (queue.length) {
    const job = queue.shift()!;
    urls.push(await exportCsv(job.id, job.batchId));
  }
  return urls;
}
