import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { HDR_AGENT, HDR_USER, type AgentKind } from "@/contracts";
import { err } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";
import { buildPack, minutesAgo, normRepo, toAgentKind, whoseAgent } from "@/lib/engine/pack";
import type { Memory } from "@/contracts";
import { rulesForFile } from "@/app/api/activity/record";
import { CARD_HTML, CARD_MIME, CARD_URI } from "./card";

// MCP (Streamable HTTP) — Hivemind for every agent, including ones without hooks (Cursor, Copilot, claude.ai…).
// Tools: get_team_rules (call first), search_memory, propose_memory (pending only). Prompt: hivemind_briefing.
// Resource: hivemind://context-pack. MCP Apps card (ui://hivemind/card.html, ./card.ts) on get_team_rules + propose_memory.
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

/** People (id → first name) and scopes (with owners) for card subtitles. */
async function directory() {
  const [{ data: people }, { data: scopes }] = await Promise.all([
    db().from("people").select("id, name"),
    db().from("scopes").select("id, parent_id, owner"),
  ]);
  const first = new Map((people ?? []).map((p) => [p.id as string, String(p.name ?? p.id).split(" ")[0]]));
  const sc = (scopes ?? []).map((x) => ({ id: x.id as string, parentId: x.parent_id as string | null, owner: x.owner as string | null }));
  const name = (id: string | null | undefined) => (id ? first.get(id) ?? id : "someone");
  /** First owner up the scope chain = who approves lessons there. */
  const lead = (scopeId: string) => scopeChain(scopeId, sc).map((id) => sc.find((x) => x.id === id)?.owner).find(Boolean) ?? null;
  return { name, lead };
}
type Directory = Awaited<ReturnType<typeof directory>>;

type CardRule = { id: string; slug: string; title: string; scopeId: string; locked: boolean; sub: string };
/** One card row per rule, worded like Adrian's McpCheckCard (src/components/site/editor-mocks.tsx). */
function cardRow(m: Memory, d: Directory): CardRule {
  const scope = `#${m.scopeId}`;
  const lead = d.lead(m.scopeId);
  let sub: string;
  if (m.locked) sub = `Locked by ${d.name(m.author)} · ${scope}`;
  else if (m.source === "review") sub = `From ${d.name(m.author)}'s review · ${scope}`;
  else if (m.source === "correction" || m.source === "agent")
    sub = `From ${d.name(m.author)}'s lesson${lead && lead !== m.author ? ` · approved by ${d.name(lead)}` : ""} · ${scope}`;
  else sub = `From ${d.name(m.author)} · ${scope}`;
  return { id: m.id, slug: m.slug, title: m.title, scopeId: m.scopeId, locked: m.locked, sub };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "1 locked rule, 2 team lessons apply" (no locked rule → "2 team lessons apply"). */
function cardHeader(rules: CardRule[]) {
  const locked = rules.filter((r) => r.locked).length;
  const lessons = rules.length - locked;
  const parts = [locked ? plural(locked, "locked rule", "locked rules") : "", plural(lessons, "team lesson", "team lessons")];
  return `${parts.filter(Boolean).join(", ")} apply`;
}

/** Pack markdown + card data; with `file`, also the rules and live edits for that file. */
async function teamRules(c: Ctx, repoArg?: string, file?: string, log = true) {
  const repo = normRepo(repoArg) || c.repo;
  const [pack, dir] = await Promise.all([
    buildPack({ repo, user: c.user, session: log ? newSession(c) : null, log, agent: c.agent }),
    directory(),
  ]);
  if (!file) {
    // No file: the card shows the 🔒 rules + the top-ranked lessons in the pack.
    const { data } = pack.memoryIds.length ? await db().from("memories").select("*").in("id", pack.memoryIds) : { data: [] };
    const byId = new Map((data ?? []).map((r) => [r.id as string, toMemory(r)]));
    const mems = pack.memoryIds.map((id) => byId.get(id)).filter((m): m is Memory => !!m && m.kind !== "owner");
    const rules = [...mems.filter((m) => m.locked), ...mems.filter((m) => !m.locked).slice(0, 3)].map((m) => cardRow(m, dir));
    return { markdown: pack.markdown, repo, file: null, rules, header: cardHeader(rules), memoryIds: pack.memoryIds };
  }

  const f = file.replace(/\\/g, "/").replace(/^\.\//, "");
  const mems = (await rulesForFile(repo, f)).slice(0, 6);
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  let q = db().from("activity").select("*").eq("file", f).gte("created_at", since).neq("actor", c.user);
  if (repo) q = q.eq("repo", repo);
  const { data: edits } = await q.order("created_at", { ascending: false }).limit(3);

  let md = `## Rules for \`${f}\`\n`;
  md += mems.length
    ? mems.map((m) => `- ${m.locked ? "🔒 " : ""}**${m.title}** (#${m.scopeId}) — ${oneLine(m.body, 200)}`).join("\n")
    : "- No file-specific rules; the team rules below still apply.";
  for (const e of edits ?? []) md += `\n- ⚠️ ${whoseAgent(e.actor, e.agent)} edited this file ${minutesAgo(e.created_at)} — coordinate first.`;
  const rules = mems.map((m) => cardRow(m, dir));
  return { markdown: `${md}\n\n${pack.markdown}`, repo, file: f, rules, header: cardHeader(rules), memoryIds: pack.memoryIds };
}

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
          _meta: { ui: { resourceUri: CARD_URI } },
        },
        async ({ repo, file }) => {
          const r = await teamRules(c, repo, file);
          return {
            ...text(r.markdown),
            structuredContent: { kind: "rules", repo: r.repo, file: r.file, header: r.header, rules: r.rules, memoryIds: r.memoryIds },
          };
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
          _meta: { ui: { resourceUri: CARD_URI } },
        },
        async ({ title, body, scope }) => {
          const all = await scopeIds();
          const want = scope?.trim() || c.repo || "org";
          const scopeId = all.some((x) => x.id === want) ? want : all.some((x) => x.id === normRepo(want)) ? normRepo(want) : "org";
          const lead = (await directory()).lead(scopeId) ?? "your lead";
          // McpApproveCard: Approve/Reject open the role-checked approvals page; MCP itself never approves.
          const card = (msg: string, l: { title: string; status: string; reason?: string | null }) => ({
            ...text(msg),
            structuredContent: {
              kind: "proposal",
              scopeId,
              title: l.title,
              lead,
              status: l.status,
              reason: l.reason ?? null,
              approveUrl: `${c.origin}/app/approvals`,
            },
          });

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
              const msg = ls
                .map((l) =>
                  l.status === "blocked"
                    ? `🚫 "${l.title}" was blocked by a 🔒 policy${l.blockedReason ? `: ${l.blockedReason}` : ""}. Do not follow it.`
                    : `⏳ "${l.title}" proposed (status ${l.status}) — a human must approve it before it applies.`,
                )
                .join("\n");
              return card(msg, { title: ls[0].title, status: ls[0].status, reason: ls[0].blockedReason });
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
          return card(`⏳ "${title}" proposed for #${scopeId} (pending) — a human must approve it before it applies.`, {
            title,
            status: "pending",
          });
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
        "hivemind-card",
        CARD_URI,
        { title: "Hivemind card", description: "MCP Apps view for get_team_rules / propose_memory.", mimeType: CARD_MIME },
        async (uri) => ({ contents: [{ uri: uri.href, mimeType: CARD_MIME, text: CARD_HTML }] }),
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
