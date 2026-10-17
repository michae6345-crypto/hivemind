import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { HDR_USER } from "@/contracts";
import { caller, err } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";
import { normRepo } from "@/lib/engine/pack";

// MCP (Streamable HTTP) for coding agents: search_memory + propose_memory. Bearer HIVEMIND_TOKEN required.
// Agents can only PROPOSE: proposals go through POST /api/events (type agent_proposal) so the engine can merge
// and conflict-check them; if that route isn't available we insert a `pending` memory directly. Never active.

const oneLine = (s: string, n = 280) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lesson";

async function scopeIds() {
  const { data } = await db().from("scopes").select("id, parent_id");
  return (data ?? []).map((s) => ({ id: s.id as string, parentId: s.parent_id as string | null }));
}

function server(ctx: { user: string; repo: string; origin: string; auth: string }) {
  return createMcpHandler(
    (s) => {
      s.registerTool(
        "search_memory",
        {
          title: "Search team memory",
          description:
            "Search Hivemind (the team's learned rules, lessons and owners) before guessing a convention. " +
            "Returns up to 8 active memories. Optional scope like 'repo/export-service' limits to that scope chain.",
          inputSchema: z.object({ query: z.string().min(1), scope: z.string().optional() }),
        },
        async ({ query, scope }) => {
          let q = db().from("memories").select("*").eq("status", "active");
          const sc = normRepo(scope) || ctx.repo;
          if (sc) {
            const all = await scopeIds();
            if (all.some((x) => x.id === sc)) q = q.in("scope_id", scopeChain(sc, all));
          }
          const { data, error } = await q;
          if (error) return text(`search failed: ${error.message}`);
          const terms = query.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length >= 3);
          const phrase = query.toLowerCase().trim();
          const hits = (data ?? [])
            .map(toMemory)
            .map((m) => {
              const title = m.title.toLowerCase();
              const body = m.body.toLowerCase();
              let score = (title + " " + body).includes(phrase) ? 5 : 0;
              for (const t of terms) score += (title.includes(t) ? 2 : 0) + (body.includes(t) ? 1 : 0);
              return { m, score: score + (m.locked ? 0.5 : 0) };
            })
            .filter((h) => h.score >= 1)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
          if (!hits.length) return text(`No team memory matches "${query}".`);
          return text(
            hits
              .map(({ m }) => `- ${m.locked ? "🔒 " : ""}**${m.title}** (#${m.scopeId}, [[${m.slug}]]) — ${oneLine(m.body)}`)
              .join("\n"),
          );
        },
      );

      s.registerTool(
        "propose_memory",
        {
          title: "Propose a team lesson",
          description:
            "Propose a reusable rule/lesson for the team (e.g. after the user corrects you). It is NOT active until a " +
            "human approves it, and it is blocked if it contradicts a 🔒 policy. scope: 'org' | 'team/<name>' | 'repo/<name>' | 'personal/<user>'.",
          inputSchema: z.object({ title: z.string().min(3), body: z.string().min(3), scope: z.string().optional() }),
        },
        async ({ title, body, scope }) => {
          const all = await scopeIds();
          const want = scope?.trim() || ctx.repo || "org";
          const scopeId = all.some((x) => x.id === want) ? want : all.some((x) => x.id === normRepo(want)) ? normRepo(want) : "org";

          // 1) through the learning engine
          try {
            const r = await fetch(`${ctx.origin}/api/events`, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: ctx.auth, [HDR_USER]: ctx.user },
              body: JSON.stringify({
                type: "agent_proposal",
                actor: ctx.user,
                repo: ctx.repo || undefined,
                payload: { title, body, scope: scopeId, text: `${title}: ${body}` },
              }),
              signal: AbortSignal.timeout(25000),
            });
            if (r.ok) {
              const res = (await r.json()) as { lessons?: { title: string; status: string; blockedReason?: string | null }[] };
              const ls = res.lessons ?? [];
              if (!ls.length) return text("Recorded. No new lesson was created (it matched an existing one or was filtered).");
              return text(
                ls
                  .map((l) =>
                    l.status === "blocked"
                      ? `🚫 "${l.title}" was blocked by a 🔒 policy${l.blockedReason ? `: ${l.blockedReason}` : ""}. Do not follow it.`
                      : `⏳ "${l.title}" proposed (status ${l.status}) — a human must approve it before it applies.`,
                  )
                  .join("\n"),
              );
            }
            if (r.status !== 404 && r.status !== 405) return text(`Proposal failed: HTTP ${r.status}`);
          } catch {
            /* engine unavailable → fallback */
          }

          // 2) fallback: insert a pending memory directly (agents can never create active memories)
          const { error } = await db()
            .from("memories")
            .insert({
              scope_id: scopeId,
              kind: "lesson",
              title,
              body,
              slug: `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`,
              status: "pending",
              source: "agent",
              author: ctx.user,
              evidence: [{ type: "agent", quote: body, actor: `agent:${ctx.user}`, at: new Date().toISOString() }],
              alpha: 1.3,
              beta: 1,
            });
          if (error) return text(`Proposal failed: ${error.message}`);
          return text(`⏳ "${title}" proposed for #${scopeId} (pending) — a human must approve it before it applies.`);
        },
      );
    },
    { serverInfo: { name: "hivemind", version: "0.1.0" } },
  );
}

async function handle(req: Request) {
  const c = caller(req);
  if (process.env.HIVEMIND_TOKEN && !c.viaToken) return err("missing or bad bearer token", 401);
  const user = c.user === "agent" ? "agent" : c.user;
  const repo = normRepo(req.headers.get("x-hm-repo"));
  const h = server({ user, repo, origin: new URL(req.url).origin, auth: req.headers.get("authorization") ?? "" });
  return h(req);
}

export { handle as GET, handle as POST, handle as DELETE };
