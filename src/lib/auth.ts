import "server-only";
import { NextResponse } from "next/server";
import { HDR_ROLE, HDR_USER, type Role, type Scope } from "@/contracts";
import { scopeChain } from "@/lib/map";

// Hackathon auth: UI sends x-hm-user / x-hm-role (role switcher). Hooks/MCP send a bearer token.
export type Caller = { user: string; role: Role | "agent"; viaToken: boolean };

export function caller(req: Request): Caller {
  const auth = req.headers.get("authorization") ?? "";
  const viaToken = !!process.env.HIVEMIND_TOKEN && auth === `Bearer ${process.env.HIVEMIND_TOKEN}`;
  const user = req.headers.get(HDR_USER) ?? (viaToken ? "agent" : "anonymous");
  const roleHdr = req.headers.get(HDR_ROLE) as Role | null;
  const role: Caller["role"] = viaToken && !roleHdr ? "agent" : roleHdr ?? "engineer";
  return { user, role, viaToken };
}

/**
 * Can `c` write/approve memories in `targetScope`?
 * security → anywhere (and may lock); lead → own team subtree; engineer → own personal scope only; agent → never (propose only).
 * `homeScope` is the caller's people.scope_id.
 */
export function canWrite(c: Caller, targetScope: string, homeScope: string | null, scopes: Pick<Scope, "id" | "parentId">[]): boolean {
  if (c.role === "security") return true;
  if (c.role === "agent") return false;
  if (c.role === "lead") return !!homeScope && scopeChain(targetScope, scopes).includes(homeScope);
  return targetScope === `personal/${c.user}`;
}

export const canLock = (c: Caller) => c.role === "security";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
