import { ActivityInput } from "@/contracts";
import { err, json } from "@/lib/auth";
import { recordActivity } from "./record";

// POST /api/activity {sessionId, actor, repo?, file} → { warnings } (collisions + rule hits)
export async function POST(req: Request) {
  const parsed = ActivityInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);
  try {
    const { warnings } = await recordActivity(parsed.data);
    return json({ warnings });
  } catch (e) {
    return err(e instanceof Error ? e.message : "activity failed", 500);
  }
}
