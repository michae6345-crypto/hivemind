import "server-only";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";
import type { AgentKind, Memory } from "@/contracts";
import { HM, headsUp, normRepo, noEmoji } from "@/lib/engine/pack";

// Shared by POST /api/activity and POST /api/hooks/tool: record an edit, return collision + rule-hit warnings.
export const COLLISION_WINDOW_MIN = 10;
/** User-facing collision line (wording: Adrian's brand spec): "Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago." */
export const COLLISION_PREFIX = "Hivemind · Heads up: ";
const GENERIC_STEMS = new Set(["index", "utils", "util", "main", "types", "test", "tests", "config", "readme", "package"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const base = (f: string) => f.split("/").pop() ?? f;

export async function recordActivity(input: { sessionId: string; actor: string; repo?: string; file: string; agent?: AgentKind }) {
  const sb = db();
  const repo = normRepo(input.repo);
  const file = input.file.replace(/\\/g, "/").replace(/^\.\//, "");
  const since = new Date(Date.now() - COLLISION_WINDOW_MIN * 60000).toISOString();

  let recent = sb.from("activity").select("*").eq("file", file).gte("created_at", since).order("created_at", { ascending: false });
  if (repo) recent = recent.eq("repo", repo);
  // One round of parallel queries (PostToolUse latency): the prior edits, our insert, and the file's rules (used on first
  // touch only). The select may or may not see our own row, so it is excluded by id.
  const [{ data: prior0 }, { data: mine }, hits] = await Promise.all([
    recent.limit(50),
    sb.from("activity").insert({ session_id: input.sessionId, actor: input.actor, agent: input.agent ?? "claude-code", repo: repo || null, file }).select("id").single(),
    ruleHits(repo, file).catch(() => [] as string[]),
  ]);
  const prior = (prior0 ?? []).filter((a) => a.id !== mine?.id);

  const warnings: string[] = [];

  // (a) collisions: other sessions on the same file in the window (latest per actor, max 3)
  const seen = new Set<string>();
  for (const a of prior) {
    if (a.session_id === input.sessionId || seen.has(a.actor) || seen.size >= 3) continue;
    seen.add(a.actor);
    warnings.push(headsUp(a.actor, a.agent, file, a.created_at, a.actor === input.actor));
  }

  // (b) rule hits: only on this session's first touch of the file, so the agent isn't nagged on every edit
  const firstTouch = !prior.some((a) => a.session_id === input.sessionId);
  if (firstTouch) warnings.push(...hits);
  return { warnings, repo, file };
}

async function ruleHits(repo: string, file: string): Promise<string[]> {
  return (await rulesForFile(repo, file))
    .slice(0, 3)
    .map((m) => `${HM}${m.locked ? "Locked rule" : "Team lesson"} for ${file}: ${noEmoji(m.title)} (#${m.scopeId}).`);
}

/** Active memories in the repo's scope chain that mention this file (path, name, or distinctive stem); locked first. */
export async function rulesForFile(repo: string, file: string): Promise<Memory[]> {
  const sb = db();
  const { data: scopeRows } = await sb.from("scopes").select("id, parent_id");
  const scopes = (scopeRows ?? []).map((s) => ({ id: s.id as string, parentId: s.parent_id as string | null }));
  const chain = repo && scopes.some((s) => s.id === repo) ? scopeChain(repo, scopes) : ["org"];
  const { data } = await sb.from("memories").select("*").in("scope_id", chain).eq("status", "active");

  const name = base(file);
  const stem = name.replace(/\.[^.]+$/, "");
  const patterns = [new RegExp(esc(file), "i"), new RegExp(`(^|[^\\w.])${esc(name)}\\b`, "i")];
  if (stem.length >= 5 && !GENERIC_STEMS.has(stem.toLowerCase())) patterns.push(new RegExp(`(?<![\\w/-])${esc(stem)}(?![\\w-])`, "i")); // not inside "repo/export-service"

  return (data ?? [])
    .map(toMemory)
    .filter((m) => m.locked || m.kind !== "owner")
    .filter((m) => patterns.some((p) => p.test(`${m.title}\n${m.body}`)))
    .sort((a, b) => Number(b.locked) - Number(a.locked));
}
