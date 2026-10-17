// Structured logger. Every line carries trace_id, tenant_id and job_id. Expert ids are logged only as
// hmacExpertId(id); names, emails and payout details never go to logs (locked rule, @greg).
import { createHmac } from "node:crypto";

export type LogContext = { trace_id: string; tenant_id: string; job_id?: string } & Record<string, unknown>;

const LOG_KEY = process.env.LOG_HMAC_KEY ?? "playground-not-a-secret";

export function hmacExpertId(expertId: string): string {
  return createHmac("sha256", LOG_KEY).update(expertId).digest("hex").slice(0, 16);
}

function write(level: "info" | "warn" | "error", msg: string, ctx: LogContext) {
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...ctx });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

export const logger = {
  info: (msg: string, ctx: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx: LogContext) => write("error", msg, ctx),
};
