import { ActivityInput } from "@/contracts";
import { err, json } from "@/lib/auth";
import { agentFromRequest, toAgentKind } from "@/lib/engine/pack";
import { recordActivity } from "./record";

// POST /api/activity {sessionId, actor, repo?, file} (+ x-hm-agent header or body.agent) → { warnings }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ActivityInput.safeParse(body);
  if (!parsed.success) return err(parsed.error.message);
  try {
    const { warnings } = await recordActivity({ ...parsed.data, agent: agentFromRequest(req, toAgentKind(body?.agent ?? "claude-code")) });
    return json({ warnings });
  } catch (e) {
    return err(e instanceof Error ? e.message : "activity failed", 500);
  }
}
