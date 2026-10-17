// POST /tasks: a lab customer submits labeling tasks. The body is parsed with a .strict() zod schema and only the
// parsed value is passed on; unknown keys are rejected, never spread into an insert (lesson from @ben).
import { z } from "zod";
import { db } from "../db.js";
import { logger } from "../logger.js";

const CreateTasks = z
  .object({
    tenant_id: z.enum(["lab-a", "lab-b"]),
    kind: z.enum(["label", "review"]),
    prompts: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  const body = CreateTasks.strict().parse(await req.json());
  const tenant = db.forTenant(body.tenant_id);
  for (const prompt of body.prompts) {
    await tenant.query(`INSERT INTO tasks (tenant_id, kind, prompt) VALUES ($1, $2, $3)`, [body.kind, prompt]);
  }
  logger.info("tasks created", { trace_id: traceId, tenant_id: body.tenant_id, count: body.prompts.length });
  return Response.json({ created: body.prompts.length }, { status: 201 });
}
