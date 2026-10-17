import { NextResponse } from "next/server";
import { caller, err } from "@/lib/auth";
import { COLLISION_PREFIX, recordActivity } from "@/app/api/activity/record";
import { agentFromRequest } from "@/lib/engine/pack";

// Claude Code PostToolUse http hook (matcher Edit|Write|MultiEdit). Body = raw hook JSON.
// Records the edit; returns collision / rule warnings as additionalContext, or {} when there's nothing to say.
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const slash = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
const leaf = (p: string) => slash(p).split("/").pop() ?? p;

export async function POST(req: Request) {
  const c = caller(req);
  if (process.env.HIVEMIND_TOKEN && !c.viaToken) return err("bad token", 401);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = await req.json().catch(() => ({}));
  const abs: string | undefined = h?.tool_input?.file_path ?? h?.tool_input?.notebook_path;
  if (!EDIT_TOOLS.has(h?.tool_name) || !abs) return NextResponse.json({});

  const cwd = slash(String(h.cwd ?? ""));
  let file = slash(abs);
  if (cwd && file.toLowerCase().startsWith(cwd.toLowerCase() + "/")) file = file.slice(cwd.length + 1);
  const repo = req.headers.get("x-hm-repo")?.trim() || (cwd ? `repo/${leaf(cwd)}` : "");

  try {
    const { warnings } = await recordActivity({ sessionId: String(h.session_id ?? "unknown"), actor: c.user, repo, file, agent: agentFromRequest(req) });
    if (!warnings.length) return NextResponse.json({});
    // Collisions are also shown to the engineer (systemMessage); additionalContext alone is model-only.
    const heads = warnings.filter((w) => w.startsWith(COLLISION_PREFIX));
    return NextResponse.json({
      ...(heads.length ? { systemMessage: heads.join("\n") } : {}),
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: warnings.join("\n") },
    });
  } catch {
    return NextResponse.json({}); // never disrupt the agent
  }
}
