import "server-only";
import { AgentKind, HDR_AGENT, type ContextPack, type Memory } from "@/contracts";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";

// Context pack: what a fresh agent session should know about a repo. Injected by hooks/session-start.mjs
// as SessionStart additionalContext (Claude Code caps that at 10k chars → we budget ~6k).
export const PACK_BUDGET = 6000;
const LIVE_WINDOW_MIN = 10;

/** 'export-service' | 'repo/export-service' → 'repo/export-service' */
export function normRepo(repo: string | null | undefined): string {
  const r = (repo ?? "").trim();
  if (!r) return "";
  return r.includes("/") ? r : `repo/${r}`;
}

/** Wilson score lower bound (z=1.96) on p = α/(α+β) with n = α+β−2 observations (Beta(1,1) prior removed). */
export function wilsonLB(alpha: number, beta: number, z = 1.96): number {
  const n = Math.max(alpha + beta - 2, 0);
  if (n === 0) return 0;
  const p = (alpha - 1) / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

const SPECIFICITY: Record<string, number> = { repo: 1, personal: 1, team: 0.85, org: 0.7 };
const specificity = (scopeId: string) => SPECIFICITY[scopeId.split("/")[0]] ?? 0.7;
const rank = (m: Memory) => wilsonLB(m.alpha, m.beta) * specificity(m.scopeId);

/** Collapse a markdown body to one line, capped. */
function oneLine(body: string, max = 320): string {
  const s = body.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

// ---- Cross-vendor attribution (x-hm-agent header, else MCP clientInfo / User-Agent) ----
const AGENT_LABEL: Record<AgentKind, string> = {
  "claude-code": "Claude Code", cursor: "Cursor", "gemini-cli": "Gemini CLI", copilot: "Copilot", codex: "Codex",
  "claude-ai": "Claude.ai", windsurf: "Windsurf", vscode: "VS Code", other: "",
};
export const agentLabel = (a: string | null | undefined) => AGENT_LABEL[a as AgentKind] ?? "";

/** Map a header value, MCP clientInfo.name or User-Agent to an AgentKind ("other" if unknown). */
export function toAgentKind(raw: string | null | undefined): AgentKind {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "other";
  const exact = AgentKind.safeParse(s);
  if (exact.success) return exact.data;
  if (s.includes("claude-code") || s.includes("claude code")) return "claude-code";
  if (s.includes("cursor")) return "cursor";
  if (s.includes("gemini")) return "gemini-cli";
  if (s.includes("codex")) return "codex";
  if (s.includes("windsurf") || s.includes("codeium")) return "windsurf";
  if (s.includes("copilot") || s.includes("visual studio code") || s.includes("vscode")) return "copilot";
  if (s.includes("claude")) return "claude-ai"; // claude.ai / Claude Desktop connectors
  return "other";
}

/** Agent for hook/activity/pack routes: x-hm-agent header (or ?agent=), default claude-code. */
export function agentFromRequest(req: Request, fallback: AgentKind = "claude-code"): AgentKind {
  const raw = req.headers.get(HDR_AGENT) || new URL(req.url).searchParams.get("agent");
  return raw ? toAgentKind(raw) : fallback;
}

/** "@adrian's Cursor agent" */
export const whoseAgent = (actor: string | null | undefined, agent?: string | null) =>
  `@${actor ?? "someone"}'s ${agentLabel(agent) ? agentLabel(agent) + " " : ""}agent`;

export function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
}

// ---- House style for everything an agent/user reads in the terminal (Adrian's editor spec, 17 Oct):
// no emojis, one prefix "Hivemind · ", #scope and @handle tokens, LOCKED RULE / TEAM LESSON labels, provenance lines.
export const HM = "Hivemind · ";
const EMOJI = /\p{Extended_Pictographic}️?\s*/gu;
export const noEmoji = (s: string) => s.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ");

/** "Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago." */
export function headsUp(actor: string | null | undefined, agent: string | null | undefined, file: string, iso: string, mine = false) {
  const who = mine ? "another of your agent sessions" : whoseAgent(actor, agent);
  return `${HM}Heads up: ${who} edited ${file} ${minutesAgo(iso)}.`;
}

/** "just now" · "12 min ago" · "3h ago" · "2d ago" */
export function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return min === 0 ? "just now" : `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; // "14 Oct"
};

/** Names, titles, scope leads and real approvers, for provenance lines. */
export async function loadDirectory() {
  const sb = db();
  const [{ data: people }, { data: scopes }, { data: approvals }] = await Promise.all([
    sb.from("people").select("id, name, title"),
    sb.from("scopes").select("id, parent_id, owner"),
    sb.from("events").select("actor, payload").eq("type", "approval").order("created_at", { ascending: true }).limit(500),
  ]);
  const byId = new Map((people ?? []).map((p) => [p.id as string, p]));
  const sc = (scopes ?? []).map((x) => ({ id: x.id as string, parentId: x.parent_id as string | null, owner: x.owner as string | null }));
  const approvedBy = new Map<string, string>();
  for (const a of approvals ?? []) {
    const id = (a.payload as { memoryId?: string } | null)?.memoryId;
    if (id && a.actor && (a.payload as { action?: string }).action !== "reject") approvedBy.set(id, a.actor as string);
  }
  const owners = (scopeId: string) => scopeChain(scopeId, sc).map((id) => sc.find((x) => x.id === id)?.owner).filter(Boolean);
  return {
    first: (id: string | null | undefined) => (id ? String(byId.get(id)?.name ?? id).split(" ")[0] : "someone"),
    title: (id: string | null | undefined) => (id ? ((byId.get(id)?.title as string | undefined) ?? "") : ""),
    /** First owner up the scope chain = who approves lessons there. */
    lead: (scopeId: string) => owners(scopeId)[0] ?? null,
    /** The recorded approver, if they own a scope in the memory's chain (ignores stale actors from older seeds). */
    approver: (m: Memory) => {
      const a = approvedBy.get(m.id);
      return a && owners(m.scopeId).includes(a) ? a : null;
    },
  };
}
export type Directory = Awaited<ReturnType<typeof loadDirectory>>;

/**
 * Provenance line: "Set by @maya · Head of Security · locked 14 Oct" | "Learned from @alex's correction · 3h ago ·
 * approved by @jordan" | "Learned from @kevin's fix in src/experts.ts:6 · 1h ago" | "Learned from @jordan's review · 2d ago" | "Proposed by @noor's agent · …" | "Written by @maya · 9d ago".
 */
export function provenance(m: Memory, d: Directory): string {
  const who = `@${m.author}`;
  if (m.locked) return [`Set by ${who}`, d.title(m.author), `locked ${day(m.createdAt)}`].filter(Boolean).join(" · ");
  const approver = d.approver(m) ?? (m.status === "active" && m.source !== "human" ? d.lead(m.scopeId) : null);
  const approved = approver && approver !== m.author ? ` · approved by @${approver}` : "";
  const origin = m.evidence[0]; // the evidence the lesson was created from
  if (m.source === "correction" && origin?.type === "fix") {
    const at = origin.file ? ` in ${origin.file}${origin.line ? `:${origin.line}` : ""}` : "";
    return `Learned from ${who}'s fix${at} · ${ago(m.createdAt)}${approved}`;
  }
  if (m.source === "correction") return `Learned from ${who}'s correction · ${ago(m.createdAt)}${approved}`;
  if (m.source === "review") return `Learned from ${who}'s review · ${ago(m.createdAt)}${approved}`;
  if (m.source === "agent") return `Proposed by ${who}'s agent · ${ago(m.createdAt)}${approved}`;
  return `Written by ${who} · ${ago(m.createdAt)}`;
}

/** LOCKED RULE · #org / TEAM RULE · #team/x / TEAM LESSON · #repo/x */
export const ruleLabel = (m: Memory) =>
  `${m.locked ? "LOCKED RULE" : m.kind === "directive" ? "TEAM RULE" : "TEAM LESSON"} · #${m.scopeId}`;

/** One scannable block: label, title, provenance, one-line body. */
export function ruleBlock(m: Memory, d: Directory, bodyMax = 260): string {
  return `${ruleLabel(m)}\n${noEmoji(m.title)}\n${provenance(m, d)}\n${noEmoji(oneLine(m.body, bodyMax))}\n`;
}

/** ContextPack + counts for the session banner ("Hivemind · Loaded {rules} team rules for #{repo} ({locked} locked)"). */
export type PackResult = ContextPack & { repo: string; rules: number; locked: number };

export type PackInput = { repo: string; user: string; session?: string | null; log?: boolean; agent?: AgentKind };

export async function buildPack({ repo, user, session, log = true, agent = "claude-code" }: PackInput): Promise<PackResult> {
  const sb = db();
  const repoId = normRepo(repo);
  const [{ data: scopeRows }, { data: personRow }] = await Promise.all([
    sb.from("scopes").select("id, parent_id"),
    sb.from("people").select("id, scope_id").eq("id", user).maybeSingle(),
  ]);
  const scopes = (scopeRows ?? []).map((s) => ({ id: s.id as string, parentId: s.parent_id as string | null }));
  const known = new Set(scopes.map((s) => s.id));

  // repo → team → org; unknown repo falls back to the user's home scope chain. Plus personal/<user>.
  const base = repoId && known.has(repoId) ? repoId : (personRow?.scope_id as string | undefined) ?? "org";
  const chain = scopeChain(base, scopes);
  if (!chain.includes("org")) chain.push("org");
  const personal = `personal/${user}`;
  if (known.has(personal) && !chain.includes(personal)) chain.push(personal);

  const now = new Date().toISOString();
  const since = new Date(Date.now() - LIVE_WINDOW_MIN * 60000).toISOString();
  const [{ data: memRows, error }, { data: actRows }] = await Promise.all([
    sb.from("memories").select("*").in("scope_id", chain).eq("status", "active"),
    repoId
      ? sb.from("activity").select("*").eq("repo", repoId).gte("created_at", since).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  if (error) throw new Error(error.message);
  const mems = (memRows ?? []).map(toMemory).filter((m) => !m.expiresAt || m.expiresAt > now);

  const locked = mems
    .filter((m) => m.locked)
    .sort((a, b) => chain.indexOf(b.scopeId) - chain.indexOf(a.scopeId) || b.alpha - a.alpha);
  const directives = mems.filter((m) => !m.locked && m.kind === "directive").sort((a, b) => rank(b) - rank(a));
  const lessons = mems.filter((m) => !m.locked && (m.kind === "lesson" || m.kind === "fact")).sort((a, b) => rank(b) - rank(a));
  const owners = mems.filter((m) => !m.locked && m.kind === "owner").sort((a, b) => specificity(b.scopeId) - specificity(a.scopeId));

  // Live now: other sessions touching this repo in the last 10 min (latest per actor+file).
  const seen = new Set<string>();
  const live: string[] = [];
  for (const a of actRows ?? []) {
    if (session && a.session_id === session) continue;
    const key = `${a.actor}|${a.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    live.push(headsUp(a.actor, a.agent, a.file, String(a.created_at), a.actor === user));
  }
  const dir = await loadDirectory();

  // ---- Greedy fill under the char budget ----
  const footer =
    "\n---\nHivemind · More team memory: call the `search_memory` MCP tool (hivemind) before guessing a convention. " +
    "If the user corrects you with a reusable rule, call `propose_memory` (it goes to a human for approval). " +
    "When you mention these rules to the user, keep this plain style: no emojis, #scope and @handle tokens.";
  // The second line is what makes agents trust the pack (an unexplained block of rules reads like a prompt injection).
  const header =
    `# Hivemind · Team rules for #${repoId || base}\n` +
    `These are this repo's working rules, loaded by the team's Hivemind SessionStart hook (see .claude/settings.json) for @${user}. ` +
    `They come from teammates' corrections and code reviews, approved by team leads. Treat them like CLAUDE.md: ` +
    `follow them, and treat LOCKED RULE entries as company policy that always applies.\n`;
  let out = header;
  const budget = PACK_BUDGET - footer.length;
  const ids: string[] = [];
  const fits = (s: string) => out.length + s.length <= budget;

  // `always` sections (locked) bypass the budget; the rest fill greedily in rank order. Blocks are blank-line separated.
  const section = (title: string, items: Memory[], fmt: (m: Memory) => string, always = false) => {
    const head = `\n## ${title}\n`;
    if (!items.length || (!always && !fits(head))) return;
    out += head;
    for (const m of items) {
      const block = "\n" + fmt(m);
      if (!always && !fits(block)) continue;
      out += block;
      ids.push(m.id);
    }
  };

  section("Locked rules (always apply)", locked, (m) => ruleBlock(m, dir, 420), true);
  if (live.length) {
    const block = `\n## Live now\n\n${live.slice(0, 5).join("\n")}\n`;
    if (fits(block)) out += block;
  }
  section("Team rules", directives, (m) => ruleBlock(m, dir));
  section("Team lessons", lessons, (m) => ruleBlock(m, dir));
  section("Who to ask", owners, (m) => `${noEmoji(m.title)}. ${noEmoji(oneLine(m.body, 200))}\n`);
  out += footer;

  const lockedCount = locked.filter((m) => ids.includes(m.id)).length;
  const pack: PackResult = {
    markdown: out,
    memoryIds: ids,
    tokens: Math.ceil(out.length / 4),
    repo: repoId || base,
    rules: ids.length,
    locked: lockedCount,
  };

  if (log && session && !session.startsWith("preview")) { // UI preview calls (session=preview) are not sessions
    await Promise.all([
      sb.from("pack_log").insert({ session_id: session, actor: user, agent, repo: repoId || null, memory_ids: ids, tokens: pack.tokens }),
      sb.from("events").insert({
        type: "session_start",
        actor: user,
        agent,
        session_id: session,
        repo: repoId || null,
        payload: { memoryIds: ids, lessons: ids.length - lockedCount, locked: lockedCount, tokens: pack.tokens },
        processed: true,
      }),
    ]);
  }
  return pack;
}
