import { EventInput, HDR_AGENT, type EventResult } from "@/contracts";
import { err, json } from "@/lib/auth";
import { ingestEvent } from "@/lib/engine/pipeline";
import { toAgentKind } from "@/lib/engine/pack";

export const maxDuration = 60;

/** POST /api/events — store an event and run the learning pipeline (correction | review_comment | agent_proposal | session_end). */
export async function POST(req: Request) {
  const parsed = EventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(`Invalid event: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  try {
    const rawAgent = req.headers.get(HDR_AGENT) ?? (typeof parsed.data.payload.agent === "string" ? parsed.data.payload.agent : null);
    const out = await ingestEvent(parsed.data, { agent: rawAgent ? toAgentKind(rawAgent) : null });
    const body: EventResult & { actions: { action: string; memoryId: string; note?: string }[]; enginePath: string } = {
      id: out.eventId,
      lessons: out.lessons,
      actions: out.captured.map((c) => ({ action: c.action, memoryId: c.memory.id, note: c.note })),
      enginePath: out.path,
    };
    return json(body);
  } catch (e) {
    console.error("[api/events]", e);
    return err((e as Error).message, 500);
  }
}
