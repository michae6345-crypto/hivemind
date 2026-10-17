// Labeling-job queue. Workers claim rows with FOR UPDATE SKIP LOCKED inside one transaction, so two workers never
// grab the same job (lesson from @ben).
import { db, type Job } from "./db.js";
import { logger } from "./logger.js";

export async function claimJobs(n: number, traceId: string): Promise<Job[]> {
  return db.transaction(async (tx) => {
    const jobs = await tx.query<Job>(
      `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1`,
      [n],
    );
    if (jobs.length) {
      await tx.query(`UPDATE jobs SET status = 'running' WHERE id = ANY($1)`, [jobs.map((j) => j.id)]);
    }
    for (const j of jobs) logger.info("job claimed", { trace_id: traceId, tenant_id: j.tenant_id, job_id: j.id });
    return jobs;
  });
}
