import "server-only";
import type { Evidence, EventInput, Memory, Scope } from "@/contracts";
import { db } from "@/lib/db";
import { scopeChain, toMemory } from "@/lib/map";
import { extractLessons, heuristicExtract, identifiers, overlap, passesFilter, polarity, tokens, type Candidate, type ItemRating, type ServedItem } from "./extract";
import { checkConflict, contradicts, heuristicConflict } from "./conflict";
import { decideMerge, heuristicMerge } from "./merge";
import { bump, fmtConfidence, roleWeight } from "./score";
import { hasLLM, type EnginePath } from "./llm";
import { describeFix, excerpt, heuristicFixExtract, isCosmetic, parseFix } from "./fix";

// The learning pipeline (PLAN §5):
//   event → ① filter → ② extract → ④ conflict vs 🔒 → ③ merge (ADD/UPDATE/DELETE/NONE) → ⑤ pending until a human approves
//   session end → ⑥ score served memories (α/β)
// Steps run on Claude Haiku when ANTHROPIC_API_KEY is set, otherwise on deterministic heuristics.

type Row = Record<string, unknown>;
type MemRow = {
  id: string;
  scope_id: string;
  title: string;
  body: string;
  locked: boolean;
  status: string;
  author: string | null;
  evidence: Evidence[];
  source: string;
  slug: string | null;
  alpha: number;
  beta: number;
};
type PersonRow = { id: string; name: string; role: string; scope_id: string | null };
type Ctx = { scopes: (Pick<Scope, "id" | "parentId"> & { level: string; owner: string | null; name: string })[]; people: PersonRow[] };

export type Action = "added" | "reinforced" | "updated" | "blocked";
export type Captured = { action: Action; memory: Memory; owner: string | null; note?: string; /** blocked: the locked rule's title */ rule?: string };
export type Outcome = {
  eventId: string;
  isCorrection: boolean;
  captured: Captured[];
  lessons: Memory[];
  ratings?: ItemRating[];
  path: EnginePath;
  /** "src/export.ts:23" when the event names a file (fix events, file-scoped corrections). */
  where?: string;
  /** "@kevin" when the lesson was learned from a code fix. */
  fixBy?: string;
  location?: { file: string; line: number | null; url: string | null };
};

const MEM_COLS = "*";
const ENGINE_SOURCES = new Set(["correction", "review", "agent"]);
const LIVE = new Set(["pending", "active", "blocked"]);
const sb = () => db();

async function loadCtx(): Promise<Ctx> {
  const [s, p] = await Promise.all([sb().from("scopes").select("id,parent_id,level,owner,name"), sb().from("people").select("id,name,role,scope_id")]);
  if (s.error) throw new Error(`scopes: ${s.error.message}`);
  return {
    scopes: (s.data ?? []).map((r) => ({ id: r.id, parentId: r.parent_id, level: r.level, owner: r.owner, name: r.name })),
    people: (p.data ?? []) as PersonRow[],
  };
}

const personOf = (ctx: Ctx, id: string) => ctx.people.find((p) => p.id === id);
/** People are mentioned as @handles (person id) everywhere the engine speaks, matching the UI's @person chips. */
const handle = (id: string | null | undefined) => (id ? `@${id.replace(/^@/, "")}` : null);

/** 'export-service' | 'repo/export-service' | 'acme/export-service' | 'C:\\code\\export-service' → 'repo/export-service' */
export function normalizeRepo(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const name = repo.replace(/^repo\//, "").split(/[\\/]/).filter(Boolean).pop();
  return name ? `repo/${name}` : null;
}

/** Make sure the repo scope exists; unknown repos are auto-registered under the actor's team (or org). */
async function ensureRepoScope(ctx: Ctx, repo: string | null, actor: string): Promise<string> {
  if (!ctx.scopes.some((s) => s.id === "org")) throw new Error("No scopes seeded (missing 'org'); run the seed first");
  if (!repo) return teamOf(ctx, personOf(ctx, actor)?.scope_id ?? "org");
  if (ctx.scopes.some((s) => s.id === repo)) return repo;
  const parent = teamOf(ctx, personOf(ctx, actor)?.scope_id ?? "org");
  const owner = ctx.scopes.find((s) => s.id === parent)?.owner ?? null;
  const { error } = await sb()
    .from("scopes")
    .upsert({ id: repo, level: "repo", name: repo.slice(5), parent_id: parent, owner }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`register repo scope: ${error.message}`);
  ctx.scopes.push({ id: repo, parentId: parent, level: "repo", owner, name: repo.slice(5) });
  console.log(`[engine] registered new repo scope ${repo} under ${parent}`);
  return repo;
}

/** Nearest team-level ancestor (or org). */
function teamOf(ctx: Ctx, scopeId: string): string {
  for (const id of scopeChain(scopeId, ctx.scopes)) {
    const s = ctx.scopes.find((x) => x.id === id);
    if (s && (s.level === "team" || s.level === "org")) return id;
  }
  return "org";
}

function ownerFor(ctx: Ctx, scopeId: string): string | null {
  for (const id of scopeChain(scopeId, ctx.scopes)) {
    const o = ctx.scopes.find((s) => s.id === id)?.owner;
    if (o) return o;
  }
  return null;
}

const slugify = (t: string) =>
  `${t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}-${Math.random().toString(16).slice(2, 6)}`;

const humanActors = (ev: Evidence[]) => new Set(ev.map((e) => e.actor).filter((a) => a && !a.startsWith("agent")));

async function servedFor(sessionId: string | null | undefined): Promise<ServedItem[]> {
  if (!sessionId) return [];
  const { data } = await sb().from("pack_log").select("memory_ids").eq("session_id", sessionId);
  const ids = [...new Set((data ?? []).flatMap((r) => (r.memory_ids as string[]) ?? []))];
  if (!ids.length) return [];
  const { data: mems } = await sb().from("memories").select("id,title,body").in("id", ids);
  return (mems ?? []) as ServedItem[];
}

async function chainMemories(chain: string[]): Promise<MemRow[]> {
  const { data, error } = await sb().from("memories").select(MEM_COLS).in("scope_id", chain).in("status", ["pending", "active", "blocked"]);
  if (error) throw new Error(`memories: ${error.message}`);
  return (data ?? []) as MemRow[];
}

async function insertMemory(row: Row): Promise<MemRow> {
  const { data, error } = await sb().from("memories").insert(row).select(MEM_COLS).single();
  if (error) throw new Error(`insert memory: ${error.message}`);
  return data as MemRow;
}

async function updateMemory(id: string, patch: Row): Promise<MemRow> {
  const { data, error } = await sb()
    .from("memories")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(MEM_COLS)
    .single();
  if (error) throw new Error(`update memory: ${error.message}`);
  return data as MemRow;
}

/**
 * Append evidence + α += w. Never changes status: chain of command means only a lead/security approval makes a
 * lesson active, no matter how many engineers back it (more evidence = higher confidence for the approver).
 */
async function reinforce(target: MemRow, evidence: Evidence, w: number, mergedBody?: string): Promise<MemRow> {
  const patch: Row = { evidence: [...(target.evidence ?? []), evidence], alpha: Number(target.alpha) + w };
  // The engine may rewrite only text it wrote itself — human-authored / seeded lessons and 🔒 rules keep their wording.
  if (mergedBody && !target.locked && ENGINE_SOURCES.has(target.source)) patch.body = mergedBody;
  return updateMemory(target.id, patch);
}

// ---------- event ingestion ----------

/** Store an event, run the learning pipeline on it, mark it processed. Used by /api/events and /api/hooks/prompt. */
export type IngestOpts = {
  /** Coding agent that produced the event (x-hm-agent) → events.agent. */
  agent?: string | null;
  /** Raw chat prompts (UserPromptSubmit): keep the event only if the classifier judged it a correction or it taught something. */
  dropIfNotCorrection?: boolean;
};

export async function ingestEvent(input: EventInput, opts: IngestOpts = {}): Promise<Outcome> {
  const repo = normalizeRepo(input.repo);
  const { data: evRow, error } = await sb()
    .from("events")
    .insert({ type: input.type, actor: input.actor, agent: opts.agent ?? null, session_id: input.sessionId ?? null, repo, payload: input.payload ?? {} })
    .select("id,created_at")
    .single();
  if (error) throw new Error(`insert event: ${error.message}`);
  const eventId = evRow.id as string;

  let outcome: Outcome;
  if (input.type === "session_end") {
    await scoreSession(input.sessionId ?? "", { eventId, actor: input.actor, agent: opts.agent });
    outcome = { eventId, isCorrection: false, captured: [], lessons: [], path: hasLLM() ? "llm" : "heuristic" };
  } else if (input.type === "correction" || input.type === "review_comment" || input.type === "agent_proposal" || input.type === "fix") {
    outcome = await learnFromEvent(eventId, { ...input, repo: repo ?? undefined });
  } else {
    outcome = { eventId, isCorrection: false, captured: [], lessons: [], path: "heuristic" };
  }
  if (opts.dropIfNotCorrection && input.type === "correction" && !outcome.isCorrection && !outcome.captured.length) {
    // "Say OK." is not a correction: don't keep it as a correction event (it would inflate correction metrics).
    await sb().from("events").delete().eq("id", eventId);
    return outcome;
  }
  if (input.type !== "session_end") {
    const ratings = outcome.ratings ?? [];
    await sb()
      .from("events")
      .update({
        processed: true,
        payload: {
          ...(input.payload ?? {}),
          isCorrection: outcome.isCorrection,
          ratings,
          enginePath: outcome.path,
          memoryIds: outcome.captured.map((c) => c.memory.id),
          actions: outcome.captured.map((c) => c.action),
          ...(outcome.location ?? {}), // {file, line, url} normalized (line parsed from the diff hunk if not sent)
        },
      })
      .eq("id", eventId);
  }
  return outcome;
}

async function learnFromEvent(eventId: string, input: EventInput): Promise<Outcome> {
  const t0 = Date.now();
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  const text = String(payload.text ?? payload.prompt ?? payload.body ?? "").trim();
  const actor = input.actor;
  const isAgent = input.type === "agent_proposal" || actor.startsWith("agent");
  // Latency matters (UserPromptSubmit hook budget): overlap DB reads with each other and with the LLM calls.
  const [ctx, served] = await Promise.all([loadCtx(), isAgent ? Promise.resolve([] as ServedItem[]) : servedFor(input.sessionId)]);
  const w = isAgent ? 0.3 : roleWeight(personOf(ctx, actor)?.role, actor);
  const repoScope = await ensureRepoScope(ctx, input.repo ?? null, actor);
  const repoChain = scopeChain(repoScope, ctx.scopes);
  const repoMems = chainMemories(repoChain);
  repoMems.catch(() => {}); // awaited below; avoid an unhandled rejection if we return early
  let cache: MemRow[] | null = null;
  const memsFor = async (chain: string[]) => {
    if (!chain.every((id) => repoChain.includes(id))) return chainMemories(chain);
    cache ??= await repoMems;
    return cache.filter((m) => chain.includes(m.scope_id));
  };
  const remember = (row: MemRow) => {
    if (cache) cache = [...cache.filter((m) => m.id !== row.id), ...(LIVE.has(row.status) ? [row] : [])];
    return row;
  };
  // Where it happened (fix events, or corrections that name a file) → evidence, event payload and hook line.
  const fix = input.type === "fix" ? parseFix(payload) : null;
  const location = fix
    ? { file: fix.file, line: fix.line ?? null, url: fix.url ?? null }
    : payload.file
      ? { file: String(payload.file).replace(/\\/g, "/"), line: Number(payload.line) > 0 ? Number(payload.line) : null, url: payload.url ? String(payload.url) : null }
      : undefined;
  const where = location ? `${location.file}${location.line ? `:${location.line}` : ""}` : undefined;
  const fixBy = fix ? (handle(actor.replace(/^agent:/, "")) ?? undefined) : undefined;
  const base = { where, fixBy, location };
  const empty = { eventId, isCorrection: false, captured: [], lessons: [], ratings: [], path: "heuristic" as EnginePath, ...base };
  const makeEvidence = (quote: string): Evidence => ({
    type: input.type === "fix" ? "fix" : input.type === "review_comment" ? "review_comment" : input.type === "agent_proposal" ? "agent" : "correction",
    quote: quote.slice(0, 500),
    actor,
    at: new Date().toISOString(),
    url: location?.url ?? (payload.url ? String(payload.url) : null),
    ref: eventId,
    file: location?.file ?? null,
    line: location?.line ?? null,
  });
  if (input.type === "fix" && !fix) return empty;

  // A fix that resolves a known violation reinforces that rule (positive evidence), never creates a new lesson.
  if (fix?.violationRuleId) {
    const id = fix.violationRuleId;
    const q = sb().from("memories").select(MEM_COLS);
    const { data } = await (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? q.eq("id", id) : q.eq("slug", id)).limit(1);
    const rule = (data?.[0] ?? null) as MemRow | null;
    if (rule) {
      const row = await reinforce(rule, makeEvidence(excerpt(fix)), w);
      const note = `reinforced by ${fixBy}'s fix`;
      console.log(`[engine] "${rule.title}" ${note} in ${where} (α ${rule.alpha}→${row.alpha})`);
      const memory = toMemory(row);
      return { ...empty, isCorrection: true, captured: [{ action: "reinforced", memory, owner: handle(ownerFor(ctx, row.scope_id)), note }], lessons: [memory] };
    }
    console.log(`[engine] fix names unknown violationRuleId ${id}; learning from the diff instead`);
  }

  // ① + ② candidates
  let candidates: Candidate[] = [];
  let ratings: ItemRating[] = [];
  let isCorrection = false;
  let path: EnginePath = "heuristic";
  if (input.type === "agent_proposal") {
    const title = String(payload.title ?? "").trim();
    if (!title) return empty;
    const scopeHint = String(payload.scope ?? "");
    candidates = [{ title, body: String(payload.body ?? title), kind: "lesson", scope: scopeHint.startsWith("team") ? "team" : "repo", confidence: 1 }];
  } else if (fix) {
    if (isCosmetic(fix)) {
      console.log(`[engine] fix in ${where} is cosmetic (rename/format/typo) → no lesson`);
      return empty;
    }
    const ex = await extractLessons({
      mode: "fix",
      text: describeFix(fix),
      repo: repoScope,
      file: fix.file,
      served: [],
      fallback: () => heuristicFixExtract(fix),
    });
    ({ candidates, isCorrection, path } = ex);
    if (path === "llm") {
      // Union with the deterministic patterns (deduped) so strong signals — PII leaving a log line — always surface,
      // even when Haiku names only one of the conventions a fix enforces.
      const known = candidates.map((c, i) => ({ id: String(i), title: c.title, body: c.body }));
      const extra = heuristicFixExtract(fix).candidates.filter((h) => heuristicMerge(h, known).event === "ADD");
      if (extra.length) console.log(`[engine] fix: + ${extra.map((e) => `"${e.title}"`).join(", ")} from diff patterns`);
      candidates = [...candidates, ...extra].slice(0, 3);
      isCorrection ||= candidates.length > 0;
    }
  } else {
    if (!passesFilter(text, actor)) {
      console.log(`[engine] filter: dropped "${text.slice(0, 40)}"`);
      return empty;
    }
    // No existing-rule list in the prompt: the model tends to skip restated rules, but restatements are evidence (merge dedupes).
    const ex = await extractLessons({
      mode: input.type === "review_comment" ? "review_comment" : "correction",
      text,
      repo: repoScope,
      context: payload.context ? String(payload.context) : undefined,
      file: payload.file ? String(payload.file) : undefined,
      served,
    });
    ({ candidates, ratings, isCorrection, path } = ex);
    if (path === "llm" && !candidates.length && (isCorrection || input.type === "review_comment")) {
      // Safety net: a rule-like restatement of an existing lesson still counts as reinforcement (never a new lesson).
      const known = (await memsFor(repoChain)).filter((m) => m.status !== "blocked");
      candidates = heuristicExtract(text, ex.isCorrection ? "correction" : "review_comment").candidates
        .filter((h) => heuristicMerge(h, known).event === "NONE")
        .map((h) => ({ ...h, reinforceOnly: true }));
      if (candidates.length) console.log(`[engine] extract: llm returned none; heuristic restatement of existing lesson → reinforce`);
    }
    if (!candidates.length && text) {
      // Guardrail visibility: an engineer telling an agent something that breaks a 🔒 rule must show up as blocked,
      // even if the extractor declined to turn it into a lesson (the loop below blocks it via the raw-text guard).
      const locked = (await memsFor(repoChain)).filter((m) => m.locked && m.status !== "blocked");
      if (heuristicConflict({ title: text, body: "" }, locked)) {
        candidates = heuristicExtract(text, "correction").candidates.slice(0, 1);
        if (candidates.length) {
          isCorrection = true;
          console.log(`[engine] extract: no lesson extracted, but the message contradicts a 🔒 rule → record it as blocked`);
        }
      }
    }
  }

  const evidence = makeEvidence(fix ? excerpt(fix) : text || candidates[0]?.title || "");
  const learned = fix
    ? `Learned from ${fixBy}'s fix in ${where} · #${repoScope}`
    : `Learned from @${actor.replace(/^agent:/, "")}${where ? ` in ${where}` : ""} · #${repoScope}`;
  const source = input.type === "review_comment" ? "review" : input.type === "agent_proposal" ? "agent" : "correction";

  const captured: Captured[] = [];
  // One event is one piece of evidence: never add it to the same memory twice (several candidates can land on one lesson).
  const touched = new Set<string>();
  for (const c of candidates) {
    const explicit = input.type === "agent_proposal" && ctx.scopes.some((s) => s.id === payload.scope) ? String(payload.scope) : null;
    const scopeId = explicit ?? (c.scope === "team" ? teamOf(ctx, repoScope) : repoScope);
    const chain = scopeChain(scopeId, ctx.scopes);
    const mems = await memsFor(chain);
    const locked = mems.filter((m) => m.locked && m.status !== "blocked");
    // Guard on the engineer's own words too: the extractor may rephrase away the "…is fine" that breaks a 🔒 rule.
    const rawLockHit = text && !isAgent ? heuristicConflict({ title: text, body: "" }, locked) : null;
    const owner = ownerFor(ctx, scopeId);
    const body = `${c.body}\n\n${learned}`;

    const block = async (lock: MemRow, faithful?: Candidate) => {
      const b = faithful ?? c; // when only the raw-text guard fired, show what the engineer actually said
      const lockOwner = handle(lock.author ?? ownerFor(ctx, lock.scope_id));
      const reason = `Contradicts ${lockOwner ? `${lockOwner}'s` : "the"} locked rule "${lock.title}".`;
      const blockedDupes = mems.filter((m) => m.status === "blocked" && !m.locked);
      const dup = heuristicMerge(b, blockedDupes);
      const dupRow = dup.event === "NONE" && dup.target ? blockedDupes.find((m) => m.id === dup.target!.id) : undefined;
      if (dupRow && touched.has(dupRow.id)) return;
      const row = remember(
        dupRow
          ? await reinforce(dupRow, evidence, w)
          : await insertMemory({
              scope_id: scopeId, kind: b.kind, title: b.title, slug: slugify(b.title), status: "blocked",
              body: `${b.body}\n\n${learned}`,
              status_reason: reason, source, author: actor, evidence: [evidence], alpha: 1 + w, beta: 1,
            }),
      );
      touched.add(row.id);
      captured.push({ action: "blocked", memory: toMemory(row), owner: lockOwner, note: reason, rule: lock.title });
    };

    // ④ conflict vs 🔒 and ③ merge are independent → run in parallel (hook latency budget); conflict decides first.
    // Locked rules are never merge targets: a correction that agrees with or overlaps a 🔒 rule becomes its own
    // pending lesson (linked as related); only a contradiction of a 🔒 rule is blocked.
    const existing = mems.filter((m) => m.status !== "blocked" && !m.locked);
    const [conflict, d] = await Promise.all([checkConflict(c, locked), decideMerge(c, existing)]);
    if (c.reinforceOnly && d.event !== "NONE" && d.event !== "UPDATE") Object.assign(d, heuristicMerge(c, existing));
    const lockHit = (conflict.conflict ? locked.find((m) => m.id === conflict.conflict!.id) : undefined) ?? rawLockHit;
    if (!conflict.conflict && rawLockHit) console.log(`[engine] conflict guard: raw message contradicts 🔒 "${rawLockHit.title}"`);
    if (lockHit) {
      // locked always wins
      await block(lockHit, !conflict.conflict && rawLockHit ? heuristicExtract(text, "correction").candidates[0] : undefined);
      continue;
    }

    // ③ apply merge. Evidence never changes status — every lesson waits for its scope owner's approval.
    let target = d.target ? existing.find((m) => m.id === d.target!.id) : undefined;
    if ((d.event === "NONE" || d.event === "UPDATE") && target && !c.reinforceOnly) {
      // Over-merge guard ("never mark as duplicates if they have key differences"): a duplicate/update must share
      // ≥2 significant stems or a code identifier with its target; otherwise it is a different lesson (ADD).
      const cText = `${c.title} ${c.body}`;
      const tText = `${target.title} ${target.body}`;
      if (overlap(tokens(c.title), tokens(tText)) < 2 && overlap(identifiers(cText), identifiers(tText)) === 0) {
        console.log(`[engine] merge guard: "${c.title}" is not "${target.title}" → ADD`);
        d.event = "ADD";
        target = undefined;
      }
    }
    if ((d.event === "NONE" || d.event === "UPDATE") && target) {
      if (touched.has(target.id)) continue;
      const merged = d.event === "UPDATE" && d.mergedText ? `${d.mergedText}\n\n${learned}` : undefined;
      const row = remember(await reinforce(target, evidence, w, merged));
      touched.add(row.id);
      captured.push({
        action: d.event === "UPDATE" ? "updated" : "reinforced",
        memory: toMemory(row),
        owner: handle(ownerFor(ctx, row.scope_id)),
        note: `${humanActors(row.evidence).size} engineer(s) agree · ${fmtConfidence(row.alpha, row.beta)}`,
      });
      continue;
    }
    // ADD (or DELETE: a new lesson that would supersede an old one). Superseding is proposed, not applied — the old
    // lesson is only retired when a human approves the new one.
    const related = locked.filter((l) => overlap(tokens(`${c.title} ${c.body}`), tokens(`${l.title} ${l.body}`)) >= 2 && l.slug);
    const links = [
      ...related.map((l) => `Related: 🔒 [[${l.slug}]]`),
      ...(d.event === "DELETE" && target?.slug ? [`Would supersede [[${target.slug}]]`] : []),
    ];
    const row = remember(
      await insertMemory({
        scope_id: scopeId, kind: c.kind, title: c.title, slug: slugify(c.title), status: "pending",
        body: links.length ? `${body}\n${links.join("\n")}` : body,
        status_reason: d.event === "DELETE" && target ? `Would supersede "${target.title}" if approved` : null,
        source, author: actor, evidence: [evidence], alpha: 1 + w, beta: 1,
      }),
    );
    touched.add(row.id);
    captured.push({ action: "added", memory: toMemory(row), owner: handle(owner) });
  }

  console.log(
    `[engine] event ${eventId} (${input.type} by ${actor}, w=${w}) → ${captured.map((c) => `${c.action}:"${c.memory.title}"`).join(", ") || "no lesson"} in ${Date.now() - t0}ms [${path}]`,
  );
  return { eventId, isCorrection, captured, lessons: captured.map((c) => c.memory), ratings, path, ...base };
}

/** One-line hook message for Claude Code's additionalContext (UserPromptSubmit). */
export function hookMessage(o: Outcome): string | null {
  const lines = o.captured.map((c) => {
    const t = c.memory.title;
    // Wording: public/brand/vscode (Adrian), mirrored in src/components/site/demo-script.ts — keep identical.
    // Plain text: Claude Code doesn't document ANSI rendering in systemMessage, so no colour codes.
    const at = o.where ? ` in ${o.where}` : "";
    const lock = `${c.owner ? `${c.owner}'s` : "the"} locked rule "${c.rule ?? "a locked rule"}"`;
    if (c.action === "blocked")
      return o.fixBy ? `Hivemind · Blocked: ${o.fixBy}'s fix${at} contradicts ${lock}.` : `Hivemind · Blocked${at}: contradicts ${lock}.`;
    if (c.memory.status === "pending")
      return `Hivemind · Lesson captured${o.fixBy ? ` from ${o.fixBy}'s fix` : ""}${at}: "${t}". Waiting on ${c.owner ?? "the scope owner"}.`;
    if (o.fixBy) return `Hivemind · Lesson reinforced by ${o.fixBy}'s fix${at}: "${t}".`;
    return `Hivemind · Lesson reinforced${at}: "${t}" is already a team rule.`;
  });
  return lines.length ? lines.join("\n") : null;
}

// ---------- ⑥ session-end scoring ----------

export type ScoreLine = {
  id: string;
  title: string;
  outcome: "helpful" | "harmful" | "untouched" | "neutral" | "skipped-locked";
  before: string;
  after: string;
  delta: { alpha: number; beta: number };
};
export type SessionScore = { sessionId: string; corrections: number; packs: number; scored: ScoreLine[]; skipped?: string };

/**
 * For every memory served in this session's context pack(s):
 *   rated helpful, or no correction touched its topic → α += 1
 *   rated harmful, or a correction contradicted it   → β += 1
 *   touched but not contradicted (re-stated)          → no change
 * Also writes pack_log.corrections = number of correction events in the session. Idempotent per session.
 */
export async function scoreSession(
  sessionId: string,
  opts: { eventId?: string; actor?: string | null; agent?: string | null } = {},
): Promise<SessionScore> {
  const res: SessionScore = { sessionId, corrections: 0, packs: 0, scored: [] };
  if (!sessionId) return { ...res, skipped: "no session id" };

  const { data: prior } = await sb().from("events").select("id").eq("type", "session_end").eq("session_id", sessionId).eq("processed", true).limit(1);
  if (prior?.length) {
    if (opts.eventId) await sb().from("events").update({ processed: true, payload: { duplicate: true } }).eq("id", opts.eventId);
    return { ...res, skipped: "already scored" };
  }
  let eventId = opts.eventId;
  if (!eventId) {
    const { data } = await sb().from("events").insert({ type: "session_end", session_id: sessionId, actor: opts.actor ?? null, agent: opts.agent ?? null, payload: {} }).select("id").single();
    eventId = data?.id;
  }

  const [{ data: packs }, { data: evs }] = await Promise.all([
    sb().from("pack_log").select("id,memory_ids,actor").eq("session_id", sessionId),
    sb().from("events").select("payload").eq("session_id", sessionId).eq("type", "correction"),
  ]);
  const corrections = (evs ?? []).filter((e) => (e.payload as Row)?.isCorrection === true);
  const texts = corrections.map((e) => String((e.payload as Row).text ?? (e.payload as Row).prompt ?? ""));
  const ratings = corrections.flatMap((e) => ((e.payload as Row).ratings as ItemRating[] | undefined) ?? []);
  res.corrections = corrections.length;
  res.packs = packs?.length ?? 0;

  if (packs?.length) {
    await sb().from("pack_log").update({ corrections: corrections.length }).eq("session_id", sessionId);
    if (opts.agent) await sb().from("pack_log").update({ agent: opts.agent }).eq("session_id", sessionId).is("agent", null);
    const ids = [...new Set(packs.flatMap((p) => (p.memory_ids as string[]) ?? []))];
    const { data: mems } = ids.length ? await sb().from("memories").select(MEM_COLS).in("id", ids) : { data: [] };
    for (const m of (mems ?? []) as MemRow[]) {
      const before = fmtConfidence(m.alpha, m.beta);
      if (m.locked) {
        res.scored.push({ id: m.id, title: m.title, outcome: "skipped-locked", before, after: before, delta: { alpha: 0, beta: 0 } });
        continue;
      }
      const mText = `${m.title}. ${m.body}`;
      const mTok = tokens(mText);
      const touching = texts.filter((t) => overlap(tokens(t), mTok) >= 2);
      const contradicted = touching.some((t) => contradicts(polarity(mText), polarity(t)));
      const r = ratings.filter((x) => x.memoryId === m.id).map((x) => x.rating);
      const outcome: ScoreLine["outcome"] =
        r.includes("harmful") || contradicted ? "harmful" : r.includes("helpful") ? "helpful" : touching.length ? "neutral" : "untouched";
      let { alpha, beta } = m;
      if (outcome === "harmful") ({ alpha, beta } = bump(alpha, beta, "harmful", 1));
      else if (outcome === "helpful" || outcome === "untouched") ({ alpha, beta } = bump(alpha, beta, "helpful", 1));
      if (alpha !== m.alpha || beta !== m.beta) await updateMemory(m.id, { alpha, beta });
      res.scored.push({ id: m.id, title: m.title, outcome, before, after: fmtConfidence(alpha, beta), delta: { alpha: alpha - m.alpha, beta: beta - m.beta } });
    }
  }
  if (eventId) await sb().from("events").update({ processed: true, payload: { corrections: res.corrections, scored: res.scored } }).eq("id", eventId);
  console.log(`[engine] session-end ${sessionId}: ${res.corrections} correction(s), ${res.scored.length} memories scored`);
  return res;
}
