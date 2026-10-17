import { after } from "next/server";
import { err, json } from "@/lib/auth";
import { HDR_USER } from "@/contracts";
import { scoreSession, type SessionScore } from "@/lib/engine/pipeline";
import { agentFromRequest } from "@/lib/engine/pack";

export const maxDuration = 60;

/**
 * POST /api/hooks/session-end — raw Claude Code SessionEnd hook JSON ({ session_id, reason, cwd, … }).
 * Scores every memory served in this session's context pack (α/β) and records pack_log.corrections.
 * Claude Code ignores the output; we return the scoring summary for scripts/smoke tests.
 */
export async function POST(req: Request) {
  const token = process.env.HIVEMIND_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) return err("unauthorized", 401);

  const hook = (await req.json().catch(() => null)) as { session_id?: string } | null;
  if (!hook?.session_id) return json({});

  const work = scoreSession(hook.session_id, { actor: req.headers.get(HDR_USER), agent: agentFromRequest(req) }).catch((e) => {
    console.error("[hooks/session-end]", e);
    return null;
  });
  after(() => work);
  const out = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  return json(out ?? { sessionId: hook.session_id, pending: true } satisfies Partial<SessionScore> & { pending?: boolean });
}
