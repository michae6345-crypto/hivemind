import type { NextRequest } from "next/server";
import { caller, err, json } from "@/lib/auth";
import { decideMemory } from "@/lib/queries";

/** POST /api/memories/:id/reject (id = uuid or slug) → Memory · 403 { error } if the caller's role can't */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/memories/[id]/reject">) {
  const { id } = await ctx.params;
  try {
    const r = await decideMemory(caller(req), decodeURIComponent(id), "reject");
    return r.ok ? json(r.memory) : err(r.error, r.status);
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
