import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { HDR_AGENT, HDR_USER, type AgentKind } from "@/contracts";
import { err } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";
import { buildPack, minutesAgo, normRepo, toAgentKind, whoseAgent } from "@/lib/engine/pack";
import { rulesForFile } from "@/app/api/activity/record";

// MCP (Streamable HTTP) — Hivemind for every agent, including ones without hooks (Cursor, Copilot, claude.ai…).
// Tools: get_team_rules (call first), search_memory, propose_memory (pending only). Prompt: hivemind_briefing.
// Resource: hivemind://context-pack.
//
// Auth: `Authorization: Bearer <HIVEMIND_TOKEN>`, or `?token=` for clients that can't send headers (claude.ai
// connectors without the headers beta). URL tokens leak into logs/history — hackathon trade-off, see
// docs/integrations/claude-ai.md. Identity: x-hm-user / ?user=, x-hm-repo / ?repo=, x-hm-agent / ?agent=.

type Ctx = { user: string; repo: string; agent: AgentKind; origin: string; token: string };

const oneLine = (s: string, n = 280) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lesson";
const newSession = (c: Ctx) => `mcp-${c.agent}-${c.user}-${crypto.randomUUID().slice(0, 8)}`;

const INSTRUCTIONS =
  "Hivemind is this engineering team's shared memory: rules and lessons learned from teammates' corrections and " +
  "code reviews, plus 🔒 company policies. At the START of every coding task, call `get_team_rules` (pass `file` " +
  "when you know which file you'll edit) and follow what it returns. Use `search_memory` before guessing a " +
  "convention. When the user corrects you with a reusable rule, call `propose_memory` (a human approves it).";

async function scopeIds() {
  const { data } = await db().from("scopes").select("id, parent_id");
  return (data ?? []).map((s) => ({ id: s.id as string, parentId: s.parent_id as string | null }));
}

/** Pack markdown + (optionally) rules and live edits for one file. */
async function teamRules(c: Ctx, repoArg?: string, file?: string, log = true) {
  const repo = normRepo(repoArg) || c.repo;
  const pack = await buildPack({ repo, user: c.user, session: log ? newSession(c) : null, log, agent: c.agent });
  if (!file) return { markdown: pack.markdown, repo, file: null, rules: [] as RuleChip[], memoryIds: pack.memoryIds };

  const f = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const rules = (await rulesForFile(repo, f)).slice(0, 6);
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  let q = db().from("activity").select("*").eq("file", f).gte("created_at", since).neq("actor", c.user);
  if (repo) q = q.eq("repo", repo);
  const { data: edits } = await q.order("created_at", { ascending: false }).limit(3);

  let md = `## Rules for \`${f}\`\n`;
  md += rules.length
    ? rules.map((m) => `- ${m.locked ? "🔒 " : ""}**${m.title}** (#${m.scopeId}) — ${oneLine(m.body, 200)}`).join("\n")
    : "- No file-specific rules; the team rules below still apply.";
  for (const e of edits ?? []) md += `\n- ⚠️ ${whoseAgent(e.actor, e.agent)} edited this file ${minutesAgo(e.created_at)} — coordinate first.`;
  const chips: RuleChip[] = rules.map((m) => ({ id: m.id, slug: m.slug, title: m.title, scopeId: m.scopeId, locked: m.locked }));
  return { markdown: `${md}\n\n${pack.markdown}`, repo, file: f, rules: chips, memoryIds: pack.memoryIds };
}
type RuleChip = { id: string; slug: string; title: string; scopeId: string; locked: boolean };

function server(c: Ctx) {
  return createMcpHandler(
    (s) => {
      s.registerTool(
        "get_team_rules",
        {
          title: "Get team rules (call first)",
          description:
            "CALL THIS FIRST at the start of any coding task in this repo, before reading or editing code. Returns the " +
            "team's Hivemind rules: 🔒 company policies, conventions learned from teammates' corrections and reviews, " +
            "who owns what, and who else is editing right now. Pass `file` (repo-relative path) to also get the rules " +
            "that apply to that file. Follow the returned rules for the rest of the task.",
          inputSchema: z.object({
            repo: z.string().optional().describe("Repo scope, e.g. 'export-service' or 'repo/export-service'. Defaults to the connector's repo."),
            file: z.string().optional().describe("Repo-relative path of the file you're about to edit, e.g. 'src/export.ts'."),
          }),
        },
        async ({ repo, file }) => {
          const r = await teamRules(c, repo, file);
          return { ...text(r.markdown), structuredContent: { repo: r.repo, file: r.file, rules: r.rules, memoryIds: r.memoryIds } };
        },
      );

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
          const sc = normRepo(scope) || c.repo;
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
          const want = scope?.trim() || c.repo || "org";
          const scopeId = all.some((x) => x.id === want) ? want : all.some((x) => x.id === normRepo(want)) ? normRepo(want) : "org";

          // 1) through the learning engine (merge + 🔒 conflict check)
          try {
            const r = await fetch(`${c.origin}/api/events`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${c.token}`,
                [HDR_USER]: c.user,
                [HDR_AGENT]: c.agent,
              },
              body: JSON.stringify({
                type: "agent_proposal",
                actor: c.user,
                repo: c.repo || undefined,
                payload: { title, body, scope: scopeId, text: `${title}: ${body}`, agent: c.agent },
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
              author: c.user,
              evidence: [{ type: "agent", quote: body, actor: `agent:${c.agent}:${c.user}`, at: new Date().toISOString() }],
              alpha: 1.3,
              beta: 1,
            });
          if (error) return text(`Proposal failed: ${error.message}`);
          return text(`⏳ "${title}" proposed for #${scopeId} (pending) — a human must approve it before it applies.`);
        },
      );

      s.registerPrompt(
        "hivemind_briefing",
        {
          title: "Hivemind briefing",
          description: "Load the team's rules for this repo into the conversation before you start coding.",
          argsSchema: z.object({
            repo: z.string().optional().describe("Repo, e.g. export-service"),
            file: z.string().optional().describe("File you're about to edit"),
          }),
        },
        async ({ repo, file }) => {
          const r = await teamRules(c, repo, file);
          return {
            description: `Hivemind team rules for ${r.repo || "this repo"}`,
            messages: [
              {
                role: "user" as const,
                content: {
                  type: "text" as const,
                  text: `${r.markdown}\n\nFollow these team rules for the rest of this conversation. Reply "Briefed." and wait for my task.`,
                },
              },
            ],
          };
        },
      );

      s.registerResource(
        "context-pack",
        "hivemind://context-pack",
        {
          title: "Hivemind context pack",
          description: "The team's current rules, lessons and owners for this repo (markdown).",
          mimeType: "text/markdown",
        },
        async (uri) => {
          const r = await teamRules(c, undefined, undefined, false);
          return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: r.markdown }] };
        },
      );
    },
    { serverInfo: { name: "hivemind", version: "0.2.0" }, instructions: INSTRUCTIONS },
  );
}

// ---- attribution: header/query → MCP clientInfo (initialize or per-request _meta) → cache → claude.ai IPs → UA
const seenClients = new Map<string, AgentKind>(); // `${ip}|${ua}` → kind learned at initialize (best effort, per instance)
const CLAUDE_AI_NET = { base: ip4("160.79.104.0"), mask: 0xfffff800 }; // Anthropic outbound 160.79.104.0/21

function ip4(s: string): number {
  const p = s.split(".").map(Number);
  return p.length === 4 && p.every((n) => n >= 0 && n < 256) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : -1;
}

function detectAgent(req: Request, url: URL, rpc: unknown): AgentKind {
  const explicit = req.headers.get(HDR_AGENT) || url.searchParams.get("agent");
  if (explicit) return toAgentKind(explicit);
  const ua = req.headers.get("user-agent") ?? "";
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const key = `${ip}|${ua}`;
  const msgs = Array.isArray(rpc) ? rpc : [rpc];
  for (const m of msgs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (m as any)?.params;
    const name = p?.clientInfo?.name ?? p?._meta?.["io.modelcontextprotocol/clientInfo"]?.name;
    if (typeof name === "string" && name) {
      const kind = toAgentKind(name);
      if (seenClients.size > 500) seenClients.clear();
      seenClients.set(key, kind);
      return kind;
    }
  }
  const cached = seenClients.get(key);
  if (cached) return cached;
  if (ip && (ip4(ip) & CLAUDE_AI_NET.mask) >>> 0 === CLAUDE_AI_NET.base) return "claude-ai";
  return toAgentKind(ua);
}

async function handle(req: Request) {
  const url = new URL(req.url);
  // Header token = HIVEMIND_TOKEN. URL token = HIVEMIND_CONNECTOR_TOKEN if set (a separate, rotatable secret for
  // connector URLs, so the hook token never sits in a URL), else HIVEMIND_TOKEN. MCP can only read + propose pending.
  const expected = process.env.HIVEMIND_TOKEN;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const urlToken = url.searchParams.get("token") || "";
  const ok = !expected || (bearer ? bearer === expected : !!urlToken && urlToken === (process.env.HIVEMIND_CONNECTOR_TOKEN || expected));
  if (!ok) return err("missing or bad token (Authorization: Bearer … or ?token=)", 401);
  const token = expected ?? ""; // forwarded to /api/events for propose_memory

  let rpc: unknown = null;
  if (req.method === "POST") rpc = await req.clone().json().catch(() => null);
  const c: Ctx = {
    user: req.headers.get(HDR_USER) || url.searchParams.get("user") || "agent",
    repo: normRepo(req.headers.get("x-hm-repo") || url.searchParams.get("repo")),
    agent: detectAgent(req, url, rpc),
    origin: url.origin,
    token,
  };
  return server(c)(req);
}

export { handle as GET, handle as POST, handle as DELETE };
