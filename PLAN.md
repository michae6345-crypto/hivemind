# Hivemind — Build Plan (SEP Hacks 2026)

> **Every correction any engineer gives any AI agent becomes a lesson every agent at the company learns — safely, with a chain of command.**

**Deadline: Sat Oct 17, 2:00 PM** — Devpost: GitHub + live link + ≤2 min video. Closing 5–7pm (must attend).
**Main track:** Grand Tech — Continual Learning (AfterQuery + SideShift). Also: Agent Monitoring (Lemma), Scale (Outcast), Design (Figma).

---

## 0. TL;DR for each of us

| | Michael — learning engine + agent integration | Adrian — product UI + design |
|---|---|---|
| Owns | `supabase/`, `src/contracts/`, `src/app/api/`, `src/lib/engine/`, `hooks/`, `eval/`, `scripts/` | `src/app/(ui)/`, `src/components/`, `src/mocks/`, `public/`, Devpost write-up |
| Tonight's goal | Claude Code session starts → context pack injected; a live correction → pending lesson in DB | 3-pane app on mock data: vault tree, CodeMirror editor with token chips, inspector |
| Tomorrow AM | Approvals, conflict-block, collision warning, scoring, eval + learning curve, deploy | Approval queue, directive editor, role switcher, learning chart, polish |

**Contract rule:** anything in `src/contracts/` changes only via Michael, in its own small commit. Adrian builds against `src/mocks/` that follow the contracts.

---

## 1. Judging questions → our answer → demo proof

| Question | Answer | Proof |
|---|---|---|
| Better the more people use it? | Every correction from anyone teaches every agent. | **Cross-user transfer**: A corrects → B's agent gets it right first try. Learning curve. |
| Learning core, not add-on? | Turn memory off → nothing left. | Eval: memory OFF vs ON. |
| Impossible without learning? | Static `CLAUDE.md` only knows what someone wrote; Hivemind learns unwritten rules and forgets stale ones. | Lesson nobody wrote down, with evidence links. |
| More valuable at scale? | More users → more evidence → higher confidence; cross-team transfer; governance keeps it from becoming noise. | Confidence rising; Team B avoids Team A's mistake. |
| Lemma: what's a failure? | Human correction, 🔒 rule violation, collision. | Corrections = labeled failures. |
| Lemma: self-detection / guardrails? | PostToolUse hook checks each edit vs rules + live activity; agents propose-only; conflicts with 🔒 auto-blocked. | Planted bad lesson blocked live. |
| Outcast: market / pay today / why now? | Every eng org running agents; buyers already pay for Unblocked ($19/user/mo), Glean, Copilot; 2026 = many parallel agents, no cross-vendor memory. | Pitch slide. |
| Figma: clear, distinct, simple? | Cursor-style workbench, token chips as visual language, one accent color. | The UI. |

**One-liner vs the deck's examples:** *Mem0 remembers one user. Glean searches documents. Hivemind learns how a whole company works and teaches every agent.*
**AfterQuery angle:** every review comment is expert feedback; Hivemind turns it into structured, attributed, role-weighted lessons — exportable as an eval/rubric set.

---

## 2. Architecture (single Next.js app — keep it simple)

```
Claude Code (Michael's + Adrian's machines)
  hooks/session-start.mjs ──GET /api/context-pack──►┐
  UserPromptSubmit (http) ──POST /api/hooks/prompt►│   Next.js on Vercel
  PostToolUse (http) ──POST /api/hooks/tool──────►│   (API routes + UI)
  MCP over HTTP  ──────────────/api/mcp──────────►│        │
                                                    │   src/lib/engine/*  ── Claude API (Haiku/Sonnet)
scripts/learn-from-prs.mjs ── gh api ──POST /api/events      │
                                                         Supabase Postgres
UI (Adrian) ── fetch /api/* (poll 2s) ────────────────────────┘
```

No auth, no embeddings, no GitHub App. Role = header dropdown sent as `x-hm-role` / `x-hm-user`. API enforces permissions.

### Repo layout
```
src/
  contracts/        zod schemas + TS types (shared, Michael owns)
  app/api/          route handlers (Michael)
  app/(ui)/         pages (Adrian)
  components/       UI (Adrian)
  mocks/            fixtures matching contracts (Adrian)
  lib/engine/       extract.ts merge.ts score.ts conflict.ts pack.ts (Michael)
  lib/db.ts         supabase server client (Michael)
hooks/              node .mjs hook scripts (Michael)
hooks/session-start.mjs  only command hook (others are http)
supabase/migrations/0001_init.sql, supabase/seed.sql
eval/               tasks/, run.mjs, results.json
scripts/            learn-from-prs.mjs, smoke-hooks.mjs
.claude/agents/     subagent definitions
```

---

## 3. Data model (agree in first 20 min, then freeze)

```sql
create type scope_level as enum ('org','team','repo','personal');
create table scopes (id text primary key, level scope_level not null, name text not null,
  parent_id text references scopes(id), owner text);           -- e.g. 'org', 'team/data-pipelines', 'repo/dataset-builder'

create table people (id text primary key, name text, role text,  -- 'security'|'lead'|'engineer'
  scope_id text references scopes(id));

create type mem_status as enum ('pending','active','rejected','invalid','blocked');
create table memories (
  id uuid primary key default gen_random_uuid(),
  scope_id text references scopes(id) not null,
  kind text not null,            -- 'directive'|'lesson'|'owner'|'fact'
  title text not null, body text not null,       -- body is markdown with #scope @person [[slug]] tokens
  slug text unique,
  locked boolean default false,
  status mem_status default 'pending',
  source text,                   -- 'human'|'correction'|'review'|'agent'
  author text,
  evidence jsonb default '[]',   -- [{type,url,quote,actor,at}]
  alpha real default 1, beta real default 1,      -- Beta confidence
  expires_at timestamptz, invalidated_by uuid,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table events (id uuid primary key default gen_random_uuid(),
  type text not null,            -- 'correction'|'review_comment'|'session_start'|'session_end'|'edit'|'approval'
  actor text, session_id text, repo text, payload jsonb, processed boolean default false,
  created_at timestamptz default now());

create table activity (id bigserial primary key, session_id text, actor text, repo text, file text,
  created_at timestamptz default now());

create table pack_log (id bigserial primary key, session_id text, actor text, repo text,
  memory_ids uuid[], tokens int, created_at timestamptz default now());
```

## 4. API contracts (`src/contracts/`)

| Route | Method | In | Out |
|---|---|---|---|
| `/api/context-pack?repo=&user=&session=` | GET | — | `{ markdown, memoryIds, tokens }` |
| `/api/events` | POST | `{type, actor, sessionId, repo, payload}` | `{ id, lessonsProposed: Memory[] }` |
| `/api/activity` | POST | `{sessionId, actor, repo, file}` | `{ warnings: string[] }` (collisions + rule hits) |
| `/api/memories?scope=&status=` | GET | — | `Memory[]` |
| `/api/memories` | POST | `{scopeId, kind, title, body, locked?, expiresAt?}` (role-checked) | `Memory` |
| `/api/memories/:id/approve` · `/reject` | POST | role headers | `Memory` |
| `/api/scopes` | GET | — | `Scope[]` (tree) |
| `/api/entities?q=&kind=` | GET | — | `{kind,id,label,detail}[]` (editor autocomplete) |
| `/api/activity/live` | GET | — | last 10 min activity + warnings |
| `/api/hooks/prompt` · `/api/hooks/tool` · `/api/hooks/session-end` | POST | raw Claude Code hook JSON | hook output JSON (`hookSpecificOutput.additionalContext`) |
| `/api/mcp` | GET/POST | MCP Streamable HTTP | tools `propose_memory`, `search_memory` |
| `/api/metrics` | GET | — | `{ curve:[{session,corrections}], repeatMistakeRate, acceptanceRate, transfer:[...] }` |

**Role rules:** security → can lock at org; lead → write/approve in own team + below; engineer → personal + propose; agent → propose only (status always `pending`).

---

## 5. The learning engine (Michael)

```
event ─► ① filter (no LLM: drop short/"lgtm"/bots)
      ─► ② extract (Haiku): {isLesson, generalizable, title, body, scopeGuess, confidence}
            classes: generalizable rule | one-off preference | task-specific fix | noise → keep only rule
      ─► ③ merge: compare to active+pending lessons in same scope chain (Haiku, ADD/UPDATE/NONE — Mem0-style)
            UPDATE → append evidence, alpha += w
      ─► ④ conflict: check vs locked memories in scope chain (Haiku: CONTRADICTS? yes→status=blocked, reason)
      ─► ⑤ promote: evidence from ≥2 distinct actors OR approved by scope owner → active
      ─► ⑥ score: on session_end, for each memory in pack_log: no correction on its topic → alpha += w; corrected against → beta += w
      ─► ⑦ pack: rank = locked first, then WilsonLB(alpha,beta) × scope_match × recency; greedy fill to ~1500 tokens
```

- **Weights w:** lead/code owner 2.0, engineer 1.0, agent self-report 0.3.
- **Wilson lower bound** (z=1.96) on p=α/(α+β), n=α+β−2 → ranking; locked rules bypass and never decay.
- **Decay (pitch-only unless time):** `α ← 1 + (α−1)·0.5^(Δt/60d)`.
- **Invalidate, don't delete** (Graphiti idea): contradicted lessons get `status=invalid`, `invalidated_by`.
- Prompts: adapt Mem0's fact-extraction + memory-update (ADD/UPDATE/DELETE/NONE) prompts (Apache-2.0) — keep JSON output, temperature 0.

### Claude Code hooks (verified vs code.claude.com/docs/en/hooks, 2026-10-16)
- **`SessionStart`** (matcher `startup|clear|compact`) → **must be `type:"command"`** (http not supported here): `node "$CLAUDE_PROJECT_DIR"/hooks/session-start.mjs` fetches `/api/context-pack` and prints `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext": pack}}`. **Hard cap: 10,000 chars** → budget pack ≤ ~6k chars.
- **`UserPromptSubmit`** → `type:"http"` straight to `POST /api/hooks/prompt` (body = hook JSON incl. `prompt`, `session_id`, `transcript_path`, `cwd`). Route runs the correction classifier; may return `hookSpecificOutput.additionalContext` ("📝 Hivemind captured a lesson, pending approval"). `onFailure:"continue"`, `timeout:5`.
- **`PostToolUse`** matcher `Edit|Write` → `type:"http"` to `POST /api/hooks/tool` (gets `tool_name`, `tool_input.file_path`). Returns warnings via `hookSpecificOutput.additionalContext` → agent sees "⚠️ Adrian's agent is editing export.ts (2 min ago)".
- **`SessionEnd`** → http/command fire-and-forget to `/api/hooks/session-end` → triggers confidence scoring for that session's pack. Output ignored.
- Headers: `Authorization: Bearer $HIVEMIND_TOKEN` + `x-hm-user` (use `allowedEnvVars`). Templates: claude-mem `plugin/hooks/hooks.json` (Apache-2.0), diet103 showcase TS hook (MIT).

### MCP — hosted *inside* the Next.js app (no separate server)
- `src/app/api/mcp/route.ts` with **`mcp-handler`** (Vercel, Apache-2.0) + `@modelcontextprotocol/server` v2 + zod v4.
- Tools: `propose_memory({title, body, scope})` (always pending) · `search_memory({query, scope?})` (Postgres full-text/trigram, no vectors).
- Connect: `.mcp.json` → `{"mcpServers":{"hivemind":{"type":"http","url":"${HIVEMIND_URL}/api/mcp","headers":{"Authorization":"Bearer ${HIVEMIND_TOKEN}"}}}}`

### Prompts to adapt (all Apache-2.0)
- **Correction detector** ← cognee `feedback_detection_system.txt`: per user message → candidate lessons (`rules|preferences|lessons_learned`, confidence ≥0.75, max 3) **+ helpful/harmful ratings for served pack items** ("Do not guess; if unclear, omit") → drives α/β.
- **PR comment → lesson** ← cognee `coding_rule_association_agent_*`: "general, strictly technical… don't suggest rules similar to existing… empty list is fine".
- **Merge** ← mem0 `DEFAULT_UPDATE_MEMORY_PROMPT` (ADD/UPDATE/DELETE/NONE; pass existing memories with short integer ids; DELETE→invalidate, NONE-duplicate→α bump).
- **Conflict vs 🔒** ← Graphiti `dedupe_edges.py resolve_edge`: "Only mark contradicted when both cannot be true… do NOT infer contradiction from recency alone." Locked always wins → new lesson `blocked`.

---

## 6. The UI (Adrian)

**Layout** (react-resizable-panels v4 via `npx shadcn add resizable` — sizes as **strings** = percent):
- **Left (18%)** vault tree: 🏢 Org → 👥 Team → 📦 Repo → 🧑 Personal; ⏳ badge for pending.
- **Center (57%)** tabs + CodeMirror 6 (`@uiw/react-codemirror`, `dynamic(..., {ssr:false})`, extensions in `useMemo`).
- **Right (25%)** inspector: token details, evidence links, confidence bar, backlinks, live activity.
- **Header:** role switcher (Security / Data Pipelines Lead / Engineer), ⌘K palette (cmdk via `npx shadcn add command`).
- **Pages/views:** Vault (default), Approvals inbox (list + detail, A/R/E shortcuts, sonner undo), Directives editor (scope, 🔒, expiry), Learning dashboard (Recharts AreaChart: corrections per session ↓, ReferenceDots where lessons were approved; stat tiles: repeat-mistake rate, acceptance rate, cross-user transfers).

**Token chips** — regex `\[\[([^\]\n]+)\]\]|#((?:org|team|repo)\/[\w.-]+)|@([\w.-]+)|(🔒)` via `MatchDecorator` → `Decoration.mark` with `data-kind`/`data-id`; autocomplete on `#`, `@`, `[[` from `/api/entities`; `hoverTooltip` card; click opens in inspector. (Pattern from SilverBullet, MIT — copy the idea, not its Lezer grammar.)

**Visual identity (dark-first):** bg `#0B0B0E`, panel `#111114`, elevated `#18181C`, border `#26262C`, text `#EDEDEF`, muted `#8A8A93`. **One accent: hive amber `#F5A524`.** Chips: team `#8B93FF`, repo `#2DD4BF`, person `#FCD34D`, link `#C4B5FD`, lock `#FB7185` (bg = same hue @ 14%). Geist Sans 13px UI, Geist Mono 14px editor, 4px grid, 28px rows, 36px panel headers, 6px radius, no panel shadows, 150ms ease-out. Hexagon motif in logo/empty states. Avoid default shadcn zinc + purple gradients.

---

## 7. Demo company seed — "a company like AfterQuery" (fictional)

- **Org** (owner: Maya, Security): 🔒 *Never mix data from different lab customers (Lab A / Lab B) in one export.* 🔒 *Never log expert personal info.*
- **team/expert-platform** (lead: Sam) · **team/data-pipelines** (lead: Jordan; repos `dataset-builder`, `export-service`) · **team/evals** (lead: Priya; repo `eval-harness`)
- ~25 seeded lessons with evidence, e.g. "Money/payouts are integer cents", "Use `logger` not `console.log`", "Every export calls `assertSingleCustomer()`", "Ask @priya about export-service", "Migrations are append-only".
- Seed `events` + `pack_log` history for 30 fake sessions so the learning curve has shape; live demo adds real points on top.

---

## 8. Eval — proves learning to an evals judge (Michael, tomorrow AM, ~2h)

- `eval/tasks/`: 12 small tasks in a tiny demo repo, each tripping one convention (logger, cents, single-customer export, append-only migrations…). Conventions exist **only** as seeded corrections/review comments, not in README.
- Arms: **A** memory OFF, **B** memory ON. (Optional C: placebo pack.) 2–3 runs each via `claude -p` headless.
- Grade with deterministic grep/AST checks per convention → violations per task, pass rate, pack tokens.
- **Learning curve:** replay corrections in order, re-run after every 3 → plot violations ↓. Report honestly: "n=12 tasks × 3 runs", raw counts.
- Output `eval/results.json` → `/api/metrics` → Adrian's dashboard.

---

## 9. 2-minute video (build ONLY what's in it)

| t | Shot |
|---|---|
| 0:00 | Problem: "Your agent repeats the mistake your reviewer flagged last week — for a different teammate." |
| 0:15 | Engineer A corrects Claude ("exports must call assertSingleCustomer"). Lesson appears ⏳ in Hivemind; lead approves (A key). |
| 0:40 | Engineer B, fresh Claude Code session → context pack injected → gets it right first try. **Cross-user transfer.** |
| 1:00 | Planted bad lesson ("mixing labs is fine for tests") → 🚫 blocked by Maya's 🔒 rule. Two agents edit same file → ⚠️ collision. |
| 1:20 | Eval: memory OFF vs ON bars + learning curve (n shown). |
| 1:40 | "Mem0 remembers a user. Glean searches docs. Hivemind learns how your company works — every agent gets smarter." |

---

## 10. Timeline (Pacific)

| When | Michael | Adrian |
|---|---|---|
| **Fri 8:00–8:20pm** | Together: read this, agree schema + contracts, clone, `pnpm i`, Supabase project + `.env.local` | same |
| **8:20–12:00am** | migration+seed → `/api/context-pack` → SessionStart hook works → `/api/events` + extract → correction becomes pending lesson | Next.js shell, theme, 3-pane layout, vault tree + editor with chips on mocks, inspector |
| **12:00am** | 🔀 merge + check: Claude Code starts with pack | 🔀 merge |
| sleep | | |
| **Sat 8:00–11:00am** | approve/reject + roles, conflict-block, activity/collision, scoring, MCP tool, eval + metrics, **deploy to Vercel** | approvals inbox, directive editor, role switcher, learning dashboard, wire to real API, polish |
| **11:00am** | ❄️ **FEATURE FREEZE** | ❄️ |
| **11:00–12:30** | rehearse + record video (Loom), fix demo bugs | slides, Devpost write-up, screenshots |
| **12:30–1:15** | upload video (YouTube unlisted/Loom), final deploy check | submit Devpost |
| **1:15pm** | ✅ **SUBMITTED** (45 min buffer) | |

**Cut order if behind:** eval learning-curve replay → decay → MCP `search_memory` → ⌘K → directive expiry → hover cards. **Never cut:** context-pack injection, correction→lesson, approve, 🔒 block, chart.

---

## 11. How we use Claude Code (agent workflow)

- **Per person:** one *orchestrator* main session + subagents in `.claude/agents/` (planner, implementer, verifier, reviewer, researcher, ui-builder). Loop: **plan → implement → verify → commit**. Skip experimental agent teams (token-heavy, flaky on Windows terminals).
- **Parallel tabs:** run 2–3 Claude sessions max per person, each on **disjoint folders** (e.g. Michael: engine tab, hooks/MCP tab, eval tab). Use `claude -w <name>` (worktree) if two tabs might touch the same files.
- **Give every agent a check it can run:** `pnpm typecheck`, smoke scripts, Playwright screenshots. Ask for output, not claims.
- **Delegation prompts** always include: objective, allowed files, output format, stop condition.
- `/clear` between unrelated tasks. Keep CLAUDE.md short.
- **Git:** pull before every session, commit small, push to `main` every ~hour, only Michael adds deps to `package.json` during contract changes (announce in chat otherwise).

---

## 12. Borrow list

| What | From | License | Use |
|---|---|---|---|
| Memory extract + ADD/UPDATE/NONE prompts | mem0ai/mem0 | Apache-2.0 | `lib/engine/extract.ts`, `merge.ts` |
| Invalidate-not-delete idea | getzep/graphiti | Apache-2.0 | `status=invalid`, `invalidated_by` |
| Ranking | Wilson score (Evan Miller) | — | `score.ts` |
| MCP in Next.js | mcp-handler + @modelcontextprotocol/server v2 | Apache-2.0 | `src/app/api/mcp/route.ts` |
| Correction detector + pack ratings | topoteretes/cognee `feedback_detection_system.txt` | Apache-2.0 | `/api/hooks/prompt` |
| Contradiction prompt | getzep/graphiti `dedupe_edges.py` | Apache-2.0 | `conflict.ts` |
| Hook wiring + context budget | thedotmack/claude-mem | Apache-2.0 | hooks + pack budget |
| Supabase starter | next.js `examples/with-supabase` | MIT | `lib/supabase/*` |
| Editor | @uiw/react-codemirror + CM6 examples | MIT | editor component |
| Hashtag/mention/wikilink pattern | silverbulletmd/silverbullet | MIT | `<a data-*>` marks + CSS |
| CM theme via CSS vars | stackblitz/bolt.new `cm-theme.ts` | MIT | editor theme |
| Panels / tree / ⌘K / chart | shadcn `resizable`, `sidebar-11` Tree, `command`, `chart` | MIT | layout |
| Approval inbox | shadcn mail example (tag `shadcn@2.1.0`) | MIT | approvals view |
| Fonts | Geist (`geist` pkg) | OFL | typography |
| ❌ Don't copy | Zettlr (GPL-3.0), basic-memory (AGPL-3.0), claude-code-hooks-mastery (no license) | — | reference only |

## 13. Env

`.env.local` (never commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_…), `SUPABASE_SECRET_KEY` (sb_secret_…, server only!), `HIVEMIND_TOKEN`, `ANTHROPIC_API_KEY`, `HIVEMIND_API_URL` (hooks/MCP target; localhost:3000 or Vercel URL). Share via password manager.
