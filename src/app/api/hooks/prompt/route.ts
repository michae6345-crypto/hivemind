import { after } from "next/server";
import { HDR_USER } from "@/contracts";
import { err, json } from "@/lib/auth";
import { hookMessage, ingestEvent, normalizeRepo, type Outcome } from "@/lib/engine/pipeline";
import { agentFromRequest } from "@/lib/engine/pack";
import { mayTeach, passesFilter } from "@/lib/engine/extract";

export const maxDuration = 60;

// Claude Code hooks time out at 5s; answer within this budget and finish learning in the background.
const BUDGET_MS = 4600;

/**
 * POST /api/hooks/prompt — raw Claude Code UserPromptSubmit hook JSON
 * ({ prompt, session_id, cwd, transcript_path, hook_event_name }).
 * Headers: Authorization: Bearer $HIVEMIND_TOKEN, x-hm-user, optional x-hm-repo, x-hm-agent (default claude-code).
 * Only prompts the classifier judges to be corrections are kept as `correction` events.
 */
export async function POST(req: Request) {
  const token = process.env.HIVEMIND_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) return err("unauthorized", 401);

  const hook = (await req.json().catch(() => null)) as { prompt?: string; session_id?: string; cwd?: string; transcript_path?: string } | null;
  const prompt = hook?.prompt?.trim();
  if (!prompt) return json({});
  // Fast path: a plain task request ("Add a CSV export …") can't teach anything, so answer at once instead of spending
  // ~1s of the engineer's prompt on an LLM call whose event would be deleted anyway.
  if (!mayTeach(prompt) || !passesFilter(prompt)) return json({});

  const actor = req.headers.get(HDR_USER) || "unknown";
  const repo = req.headers.get("x-hm-repo") || normalizeRepo(hook?.cwd) || undefined;

  const work = ingestEvent({
    type: "correction",
    actor,
    sessionId: hook?.session_id,
    repo,
    payload: { text: prompt, transcriptPath: hook?.transcript_path ?? null },
  }, { agent: agentFromRequest(req), dropIfNotCorrection: true }).catch((e) => {
    console.error("[hooks/prompt]", e);
    return null;
  });
  after(() => work); // keep the pipeline alive after we respond if it overruns the budget

  const out = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), BUDGET_MS))]);
  const msg = out ? hookMessage(out as Outcome) : null;
  if (!msg) return json({});
  // additionalContext reaches only the model ("neither channel produces a visible transcript entry"); systemMessage is
  // what the engineer sees in Claude Code.
  return json({ systemMessage: msg, hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: msg } });
}
