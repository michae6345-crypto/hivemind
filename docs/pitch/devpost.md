# Hivemind: Devpost submission

> Paste-ready text for each Devpost field. Every number comes from `docs/eval.md` / `eval/results.json`.
> Before submitting, check the **Build status** table at the bottom against `git log origin/main` and delete any
> sentence that describes a ⏳ row as working.

**Tagline (≤200 chars):** Correct one AI coding agent and every agent at your company learns it. Lessons are approved
by a lead, locked rules can't be overridden, and an eval shows the difference: 39% → 100% pass.

**Try it out:** https://hivemind-beta-virid.vercel.app · GitHub: https://github.com/michae6345-crypto/hivemind

**Tracks:** Grand Tech: Continual Learning · Agent Behavior Monitoring (Lemma) · Most Scalable to $1B (Outcast) ·
Best Visual Design (Figma)

---

## Inspiration

Our teams use several coding agents at once, and each one starts every session knowing nothing about how we work. A
reviewer tells Alex's agent that exports must call `assertSingleCustomer()`. Next week Noor's agent makes the same
mistake in the same file, and someone has to type the same correction again.

The written rules (`CLAUDE.md`, Cursor rules, a wiki page) only hold what somebody remembered to write down. Most of
a team's conventions live in review comments and "no, not like that" messages, and those disappear when the chat
closes. Atlassian's 2025 State of DevEx survey found that finding information is now developers' top source of
friction, and half of them lose 10+ hours a week to organizational inefficiencies. Agents make this worse, because
each new session is a new hire with no memory.

The continual-learning examples in the track deck learn from one person (Cursor Tab from your accepts and rejects,
Mem0 from one user's chats) or search what is already written (Glean). We wanted the version that learns from
everyone on a team and passes it to every agent they use.

## What it does

Hivemind is shared memory for AI coding agents, with a chain of command.

1. **It learns from corrections.** When an engineer corrects their agent, Hivemind turns the correction into a short,
   attributed lesson ("Exports call `assertSingleCustomer(rows)` before writing", evidence: Alex's correction on
   `src/export.ts`). Agents can also propose lessons through MCP. Every proposal starts as ⏳ **pending**.
2. **A human approves it.** The lead who owns that scope (team, repo) approves or rejects it in the Approvals inbox.
   Agents can only propose. They can never approve.
3. **Every agent gets it.** When any engineer starts a new agent session, a session-start hook injects a context pack:
   locked policies first, then lessons ranked by confidence and scope, the code owners, and who else is editing the
   repo right now. It stays under 6,000 characters (Claude Code caps hook context at 10,000).
4. **Locked rules can't be overridden.** Security can 🔒 lock an org-wide rule ("Never mix data from different lab
   customers in one export"). Locked rules always come first in the pack and never decay. A proposed lesson that
   contradicts one is blocked.
5. **It watches agents while they work.** A PostToolUse hook records every file edit. If another engineer's agent
   touched the same file in the last 10 minutes, whichever tool it ran in, the agent is told: "⚠️ @alex's Cursor agent
   edited export.ts 2 min ago — coordinate before changing it." The first time an agent touches a file, it also gets the locked rules that mention
   that file.
6. **Confidence changes with use.** Each lesson keeps a Beta(α, β) score. Evidence from more people and sessions
   without a repeat correction raise it, and corrections against it lower it. The pack ranks lessons by the Wilson
   lower bound, so a lesson seen once by one person ranks below one confirmed by five.
7. **It works with any agent, in any terminal.** One command, `hivemind init`, connects a repo to the agents the team
   already uses: Claude Code, Cursor, Gemini CLI, Codex, GitHub Copilot and Windsurf, each through its own hooks and
   MCP. Clients without hooks (claude.ai, Claude Desktop) call `get_team_rules` and `propose_memory` over MCP. In the
   editor, the same lessons show inline with the name of the person who taught them, and code that breaks a 🔒 rule
   is underlined with a one-click fix.

The demo company is **Meridian Data**, a fictional AI training-data company with two lab customers (Lab A, Lab B),
a Head of Security (Maya), a Data Pipelines lead (Jordan) and two engineers (Alex, Noor).

### Does it work? The eval

We built a small TypeScript export service with six team conventions. None of them are written anywhere in the repo.
Each exists only as a past correction. We wrote 12 ordinary feature requests (two per convention) that tempt the
agent to break one, then ran headless Claude Code (Sonnet 5.5) on each, 3 times per arm, in a fresh copy of the repo
with `--safe-mode` so no CLAUDE.md, hooks or MCP could leak in. Grading is deterministic (regex graders, checked
against 16 hand-written cases). There is no LLM judge.

| Arm | What the agent got | Pass (36 runs) | Broke the task's rule |
|---|---|---|---|
| OFF | task prompt only | 14/36 (39%) | 22 runs |
| PLACEBO | same-size pack of 12 unrelated lessons | 15/36 (42%) | 21 runs |
| **ON** | Hivemind pack: the 6 lessons + 6 distractors | **36/36 (100%)** | **0 runs** |

- **The placebo is why we trust it.** Extra context alone did nothing (15/36). The lessons' content did the work.
- **Held-out tasks:** for 4 tasks, no text from that task went into any lesson. They show whether a lesson learned
  on one task carries to another. OFF passed 3/12, ON 12/12.
- **Significance:** ON beat OFF on 8 tasks, tied on 4 (both always passed) and lost on none. Exact sign test over the
  12 tasks: p = 0.0078.
- **Learning curve:** adding the six lessons one at a time took violations on the six "second" tasks from 5 → 3 → 2
  → 1 → 1 → 1 → 0. Each lesson removed its own violation and no other (1 run per point, so it's illustrative).

**Limitations.** This is small: 12 tasks we wrote, one fixture, one model. ON measures whether agents follow
lessons once they are served, not retrieval quality. We wrote the lessons in the format the extractor produces; they
were not extracted live during the eval. Four tasks were already passed with memory off, so 8 tasks do the
discriminating. The 14-day session history on the dashboard is **synthetic** (generated by
`scripts/seed-history.mjs` and labeled as such in the API). The eval is our only measured result. Full method,
per-task table and reproduction commands: `docs/eval.md`.

## How we built it

- **App:** Next.js (App Router, TypeScript), Tailwind, shadcn/ui, Motion, CodeMirror 6 for the lesson editor (with
  `#scope`, `@person` and `[[lesson]]` chips). One Next.js app holds the UI, the API and the MCP server.
- **Data:** Supabase Postgres. Tables for scopes (org → team → repo → personal), people and roles, memories
  (status `pending | active | rejected | invalid | blocked`, `locked`, α/β, evidence JSON), events, activity and a
  pack log.
- **Agent integration:** hooks and MCP, per tool. In Claude Code, SessionStart is a Node script that fetches
  `/api/context-pack`, and UserPromptSubmit, PostToolUse and SessionEnd are http hooks; PostToolUse returns collision
  and rule warnings. Cursor, Gemini CLI, Codex, Copilot and Windsurf get adapters that map their own hook events onto
  the same endpoints, and `hivemind init` writes each tool's config. An MCP server (`mcp-handler`, Streamable HTTP,
  inside a Next.js route) exposes `get_team_rules`, `search_memory` and `propose_memory`. Proposals are always
  pending.
- **Ranking:** Wilson lower bound on each lesson's Beta score × scope specificity, with locked policies first, filled
  greedily to the character budget.
- **Learning engine:** Claude Haiku 5.5 classifies corrections (generalizable rule vs one-off vs noise), merges
  them into existing lessons (Mem0-style ADD/UPDATE/NONE) and checks them against locked rules (a Graphiti-style
  "both can't be true" prompt).
- **Eval harness:** `eval/run.mjs` runs `claude -p` in fresh fixture copies, 6 at a time, diffs against the pristine
  copy, and grades with `eval/check.mjs`. Runs are cached, so the report can be rebuilt from `eval/out/`.
- **How we worked:** two people, each running Claude Code with planner / implementer / verifier subagents on folders
  that didn't overlap, plus a set of parallel agents on Friday night for the cross-vendor integrations.

## Challenges we ran into

- **Proving it learns, not just "more prompt".** Our first comparison was OFF vs ON. A judge could fairly say any
  extra text makes the agent more careful. The placebo arm and the held-out split answer that, and they took longer
  to design than the harness itself.
- **Keeping the eval clean.** Headless Claude Code reads CLAUDE.md, hooks and MCP config by default, so early runs
  were picking up our own project rules. `--safe-mode` and a fresh temp copy per run fixed it.
- **Hook limits.** SessionStart has to be a command hook (http isn't supported there), its context is capped at
  10,000 characters, and http hook URLs don't expand environment variables. The pack budget and the setup guide are
  built around those limits.
- **Writing graders that are fair both ways.** The money grader has to flag `parseFloat` in payout code but not the
  string "$2.50" in a log message. We wrote 16 compliant and violating examples and made the graders pass all of them
  before trusting any number.
- **Making a correction general.** "Use `assertSingleCustomer` here" is a fix. "Every export calls
  `assertSingleCustomer`" is a lesson. Most chat messages are neither, so the extractor has to drop them.

## Accomplishments that we're proud of

- A controlled eval with a placebo arm and held-out tasks: 14/36 → 36/36 pass, placebo 15/36, p = 0.0078 at the task
  level, all reproducible from the repo with raw diffs committed.
- Governance in the data model rather than in a prompt: agents can only write `pending`, locked rules always come
  first in the pack, and the API checks roles on every write.
- Collision warnings between agents run by different people, delivered inside the agent's own loop rather than in a
  dashboard nobody watches.
- Being plain about what is synthetic: the dashboard's history is generated, labeled and kept apart from the eval.

## What we learned

- The agent was already good at following a rule once it saw one: 36/36 with the right lessons in front of it. What
  it lacked was a way to hear about rules that only existed in someone's correction.
- Retrieval decides most of the outcome. Our eval serves a curated pack; in production the pack's ranking and budget
  decide whether the right lesson shows up, and that is the next thing to measure.
- Shared memory is a security surface. OWASP's 2026 Top 10 for agentic applications lists memory and context
  poisoning as ASI06. Approval, locks and propose-only agents exist because a memory that every agent trusts has to
  be harder to write to than a single chat.
- A placebo arm costs one extra run per task and answers the first question any evals person asks.

## What's next

- **Closing the gaps between tools:** Windsurf's hooks can't inject context and VS Code has no session-end event,
  so Windsurf briefs from a rules file and MCP, and Copilot in VS Code doesn't update confidence yet. Each gap closes when
  the vendor adds the hook.
- **Learning from PR review comments,** not only chat corrections (a `gh api` importer).
- **Measuring retrieval:** run the eval against the live ranked pack instead of the curated one, on more tasks and
  more models.
- **Decay and invalidation:** halve the evidence weight every 60 days and mark contradicted lessons `invalid`
  instead of deleting them, so the memory can forget stale rules.
- **Export lessons as an eval set:** every correction is a labeled failure, and an attributed set of them is a
  rubric for testing agents on a company's own conventions.

## Built with

`next.js` · `typescript` · `react` · `tailwindcss` · `shadcn/ui` · `motion` · `codemirror` · `supabase` ·
`postgresql` · `anthropic` · `claude-code` · `claude-haiku` · `claude-sonnet` · `model-context-protocol` ·
`mcp-handler` · `zod` · `node.js` · `vercel` · `pnpm` · `cursor` · `gemini-cli` · `codex` · `github-copilot` · `windsurf`

---

## Build status (internal, delete before submitting)

Checked against `origin/main` at **673658d, Fri Oct 16, 11:20 PM**. Only ✅ rows may be described as working in
the video or on Devpost. ⏳ rows are roadmap until they land. ✅ means the code is on main and deployed; the full run sheet
(`scripts/e2e-demo.mjs`) has not been rehearsed end to end against the deployment yet.

| Feature | Status | Where |
|---|---|---|
| Seeded demo company (Meridian Data), scopes, people, roles | ✅ | `src/mocks/data.ts`, `scripts/seed.mjs` |
| Context pack + SessionStart hook (locked first, Wilson-ranked, ≤6k chars) | ✅ | `src/lib/engine/pack.ts`, `hooks/session-start.mjs` |
| PostToolUse collision + locked-rule warnings, live activity | ✅ | `src/app/api/hooks/tool`, `src/app/api/activity` |
| MCP `get_team_rules` / `search_memory` / `propose_memory` (always pending) | ✅ | `src/app/api/mcp/route.ts` |
| Eval (OFF / placebo / ON, held-out, curve) + `/api/metrics` | ✅ | `eval/`, `docs/eval.md` |
| UI: Lessons, Approvals, Results on seed data, live when the API answers | ✅ | `src/components/hm/` |
| Website at `/`, app at `/app` | ✅ | `src/app/page.tsx`, `src/app/app/` |
| Correction typed to the agent → pending lesson (`/api/hooks/prompt` + extractor) | ✅ | `src/app/api/hooks/prompt`, `src/lib/engine/pipeline.ts` |
| Block a lesson that contradicts a 🔒 rule | ✅ | `src/lib/engine/pipeline.ts` |
| Confidence update at session end (`/api/hooks/session-end`) | ✅ | `src/app/api/hooks/session-end` |
| Cross-vendor: `hivemind init / sync / status` and hook adapters for Claude Code, Cursor, Gemini CLI, Copilot, Codex, Windsurf | ✅ | `cli/`, `integrations/`, `hooks/adapters/` |
| Claude chat (claude.ai, Claude Desktop) and VS Code Copilot through MCP | ✅ | `docs/integrations/` |
| Demo reset + rehearsal scripts | ✅ | `scripts/reset-demo.mjs`, `scripts/e2e-demo.mjs` |
| Approve / reject (role-checked, 🔒 blocks only security can clear), `POST /api/memories` | ✅ | `src/app/api/memories/` |
| Visible "⬢ Hivemind loaded N team rules" line at session start | ✅ | `hooks/session-start.mjs` |
| VS Code overlay (agent H) | ✅ `.vsix` packaged | `vscode-extension/dist/hivemind-vscode.vsix` |
| MCP chat cards for `get_team_rules` / `propose_memory` (MCP Apps) | ✅ | `src/app/api/mcp/` |
| Vercel deploy (live link): https://hivemind-beta-virid.vercel.app | ✅ auto-deploys from main | `docs/deploy.md` |
| Decay, invalidation, PR-comment importer | roadmap | |
