import { connection } from "next/server";
import { err, json } from "@/lib/auth";
import { auth, loadRules } from "../shared";
import type { RulesResponse } from "../types";

// GET /api/vscode/rules?repo=&file=&user= → RulesResponse. Status bar, CodeLens, hovers in the VS Code extension.
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const a = auth(req, url.searchParams.get("user"));
  if (a instanceof Response) return a;
  const file = (url.searchParams.get("file") ?? "").replace(/\\/g, "/");
  try {
    const ctx = await loadRules(url.searchParams.get("repo") ?? "", a.user, file);
    const res: RulesResponse = {
      repo: ctx.repo,
      org: ctx.org,
      file,
      rules: ctx.rules,
      pending: {
        count: ctx.pending.length,
        items: ctx.pending.slice(0, 5).map(({ id, title, owner, scopeId }) => ({ id, title, owner, scopeId })),
      },
      approver: ctx.approver,
    };
    return json(res);
  } catch (e) {
    return err(e instanceof Error ? e.message : "rules failed", 500);
  }
}
