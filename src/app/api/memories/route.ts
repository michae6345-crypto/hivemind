import type { NextRequest } from "next/server";
import { CreateMemoryInput } from "@/contracts";
import { canLock, canWrite, caller, err, json } from "@/lib/auth";
import { db } from "@/lib/db";
import { toMemory } from "@/lib/map";
import { getScopes, homeScopeOf, listMemories, logEvent } from "@/lib/queries";

/** GET /api/memories?scope=&chain=1&status=pending,active&q= → { memories } */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const memories = await listMemories({
      scope: p.get("scope"),
      chain: p.get("chain") === "1" || p.get("chain") === "true",
      status: p.get("status"),
      q: p.get("q"),
    });
    return json({ memories });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}

const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "memory";

/**
 * POST /api/memories { scopeId, kind, title, body, locked?, expiresAt? } → Memory (201)
 * Humans with write rights on the scope → active. Everyone else (agents/token callers, engineers outside
 * their personal scope) → pending proposal. `locked` requires security (403 otherwise).
 */
export async function POST(req: NextRequest) {
  const c = caller(req);
  const parsed = CreateMemoryInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const input = parsed.data;
  try {
    const [scopes, home] = await Promise.all([getScopes(), homeScopeOf(c.user)]);
    if (!scopes.some((s) => s.id === input.scopeId)) return err(`unknown scope ${input.scopeId}`);
    if (input.locked && !canLock(c)) return err("only security can create locked memories", 403);

    const isAgent = c.role === "agent" || c.viaToken;
    const active = !isAgent && canWrite(c, input.scopeId, home, scopes);
    const now = new Date().toISOString();
    const base = slugify(input.title);
    const { data: taken } = await db().from("memories").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((r) => r.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

    const { data, error } = await db()
      .from("memories")
      .insert({
        scope_id: input.scopeId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        slug,
        locked: input.locked,
        status: active ? "active" : "pending",
        source: isAgent ? "agent" : "human",
        author: c.user,
        evidence: [
          {
            type: isAgent ? "agent" : "manual",
            quote: isAgent ? `Proposed by ${c.user}` : `Written by ${c.user}`,
            actor: c.user,
            at: now,
          },
        ],
        alpha: input.locked ? 10 : active ? 2 : 1,
        beta: 1,
        expires_at: input.expiresAt ?? null,
      })
      .select("*")
      .single();
    if (error) return err(error.message, 500);
    await logEvent({
      type: active ? "approval" : "agent_proposal",
      actor: c.user,
      payload: { memoryId: data.id, slug, title: input.title, scopeId: input.scopeId, role: c.role, created: true },
    });
    return json(toMemory(data), 201);
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
