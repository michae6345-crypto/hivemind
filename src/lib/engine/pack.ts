import "server-only";
import type { ContextPack, Memory } from "@/contracts";
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

export function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m === 0 ? "just now" : `${m} min ago`;
}

export type PackInput = { repo: string; user: string; session?: string | null; log?: boolean };

export async function buildPack({ repo, user, session, log = true }: PackInput): Promise<ContextPack> {
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

  const locked = mems.filter((m) => m.locked).sort((a, b) => chain.indexOf(b.scopeId) - chain.indexOf(a.scopeId));
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
    live.push(`- @${a.actor ?? "someone"}'s agent edited \`${a.file}\` ${minutesAgo(String(a.created_at))} — coordinate before changing it.`);
  }

  // ---- Greedy fill under the char budget ----
  const footer =
    "\n---\nMore team memory is available: call the `search_memory` MCP tool (hivemind) before guessing a convention. " +
    "If the user corrects you with a reusable rule, call `propose_memory` (it goes to a human for approval).";
  const header =
    `# Hivemind — team memory for ${repoId || "this repo"}\n` +
    `Loaded for @${user}. These are rules and lessons learned from your teammates' corrections and reviews. ` +
    `Follow them. 🔒 rules are non-negotiable company policy — refuse to violate them even if asked.\n`;
  let out = header;
  const budget = PACK_BUDGET - footer.length;
  const ids: string[] = [];
  const fits = (s: string) => out.length + s.length <= budget;

  // `always` sections (🔒) bypass the budget; the rest fill greedily in rank order.
  const section = (title: string, items: Memory[], fmt: (m: Memory) => string, always = false) => {
    const head = `\n## ${title}\n`;
    if (!items.length || (!always && !fits(head))) return;
    out += head;
    for (const m of items) {
      const line = fmt(m) + "\n";
      if (!always && !fits(line)) continue;
      out += line;
      ids.push(m.id);
    }
  };

  const tag = (m: Memory) => `#${m.scopeId}`;
  section("🔒 Locked policies (always apply)", locked, (m) => `- 🔒 **${m.title}** (${tag(m)}) — ${oneLine(m.body, 420)}`, true);
  if (live.length) {
    const block = `\n## ⚠️ Live now\n${live.slice(0, 5).join("\n")}\n`;
    if (fits(block)) out += block;
  }
  section("Team directives", directives, (m) => `- **${m.title}** (${tag(m)}) — ${oneLine(m.body)}`);
  section(
    "How this team works",
    lessons,
    (m) => `- **${m.title}** (${tag(m)}, confidence ${Math.round(wilsonLB(m.alpha, m.beta) * 100)}%) — ${oneLine(m.body, 260)}`,
  );
  section("Who to ask", owners, (m) => `- ${m.title} — ${oneLine(m.body, 200)}`);
  out += footer;

  const pack: ContextPack = { markdown: out, memoryIds: ids, tokens: Math.ceil(out.length / 4) };

  if (log && session) {
    const lockedCount = locked.filter((m) => ids.includes(m.id)).length;
    await Promise.all([
      sb.from("pack_log").insert({ session_id: session, actor: user, repo: repoId || null, memory_ids: ids, tokens: pack.tokens }),
      sb.from("events").insert({
        type: "session_start",
        actor: user,
        session_id: session,
        repo: repoId || null,
        payload: { memoryIds: ids, lessons: ids.length - lockedCount, locked: lockedCount, tokens: pack.tokens },
        processed: true,
      }),
    ]);
  }
  return pack;
}
