import { connection } from "next/server";
import { agentFromRequest, buildPack } from "@/lib/engine/pack";
import { caller, err, json } from "@/lib/auth";

// GET /api/context-pack?repo=&user=&session=[&log=0][&agent=] → ContextPack. Called by hooks/session-start.mjs
// (and other agents' adapters, which send x-hm-agent).
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const c = caller(req);
  const user = url.searchParams.get("user") || (c.user !== "anonymous" && c.user !== "agent" ? c.user : "sam");
  const repo = url.searchParams.get("repo") ?? "";
  const session = url.searchParams.get("session");
  try {
    const pack = await buildPack({ repo, user, session, log: url.searchParams.get("log") !== "0", agent: agentFromRequest(req) });
    return json(pack);
  } catch (e) {
    return err(e instanceof Error ? e.message : "context pack failed", 500);
  }
}
