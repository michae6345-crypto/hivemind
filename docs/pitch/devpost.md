# Hivemind: Devpost submission

> Paste-ready text for each Devpost field. Every number comes from `docs/eval.md` / `eval/results.json`.
> Before submitting, check the **Build status** table at the bottom against `git log origin/main` and delete any
> sentence that describes a ⏳ row as working.

### Submission checklist (from sephacks-2026.devpost.com, read 17 Oct)

- [ ] **Devpost closes Oct 17, 2:00 PM EDT = 11:00 AM PT.** The rules page says "Oct 16 5 PM - Oct 17 2 PM", but
  Devpost's countdown and its confirmation email both say 2:00 PM *EDT*. Submit by 10:45 AM PT to be safe.
- [ ] **A 2-minute demo + pitch video** (YouTube or Loom link). Hard cap 2:00. Script: `docs/pitch/video-script.md`.
- [ ] **GitHub project link.** The repo is **private** right now, and judging says "ensure your project AND GitHub
  links work". Make it public (or add the judges) before submitting.
- [ ] **Project link:** https://hivemind-beta-virid.vercel.app (check it loads in a logged-out browser).
- [ ] **Team of 4 or fewer:** Adrian Erlikhman, Michael Tarekegn. Built during the hackathon (Oct 16 5 PM onward).
- [ ] **Opt in to every prize** on the submission form (cross-eligibility is allowed):
  Grand Tech Winner · Grand Tech Runner-Up · Best Visual Design · Most Scalable To $1B · Continual Failure Detection.
- [ ] Demo is legible: 1920×1080, 16pt terminal font, browser zoom 125%.
- [ ] Judging criteria to hit in the story and the video: **Functionality** (how functional is the demo),
  **Continual Learning** (does it get better as it's used, or adapt as the world changes), **Pitch** (put the judges in
  the user's shoes). Rules add: "a big focus on continual learning, creativity and feasibility."
- [ ] The demo company's people in this file and the video are the live database's (Alex, Noor, Jordan, Maya). The
  website's demo data now says @kevin, @emily, @ben, @greg. Match them before recording, or leave both and don't
  show the website and the app side by side.

**Tagline (≤200 chars):** Correct one AI coding agent and every agent at your company learns it. Lessons are approved
by a lead, locked rules can't be overridden, and an eval shows the difference: 39% → 100% pass.

**Try it out:** https://hivemind-beta-virid.vercel.app · GitHub: https://github.com/michae6345-crypto/hivemind

**Prizes entered (all five):** Grand Tech Winner · Grand Tech Runner-Up (Continual Learning: AfterQuery + SideShift) ·
Continual Failure Detection (Lemma) · Most Scalable To $1B (Outcast Ventures) · Best Visual Design (Figma)

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
   `src/export.ts`). Agents can also propose lessons through MCP. Every proposal starts as **pending**, and the agent's terminal says so:
   "Hivemind · Lesson captured: … Waiting on @jordan."
2. **A human approves it.** The lead who owns that scope (team, repo) approves or rejects it in the Approvals inbox.
   Agents can only propose. They can never approve.
3. **Every agent gets it.** When any engineer starts a new agent session, a session-start hook injects a context pack:
   locked policies first, then lessons ranked by confidence and scope, the code owners, and who else is editing the
   repo right now. It stays under 6,000 characters (Claude Code caps hook context at 10,000).
4. **Locked rules can't be overridden.** Security can lock an org-wide rule ("Never mix data from different lab
   customers in one export"). Locked rules always come first in the pack and never decay. A proposed lesson that
   contradicts one is blocked.
5. **It watches agents while they work.** A PostToolUse hook records every file edit. If another engineer's agent
   touched the same file in the last 10 minutes, whichever tool it ran in, the agent and the engineer are told:
   "Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago." The first time an agent touches a file,
   it also gets the locked rules that mention that file.
6. **Confidence changes with use.** Each lesson keeps a Beta(α, β) score. Evidence from more people and sessions
   without a repeat correction raise it, and corrections against it lower it. The pack ranks lessons by the Wilson
   lower bound, so a lesson seen once by one person ranks below one confirmed by five.
7. **It works with any agent, in any terminal.** One command, `hivemind init`, connects a repo to the agents the team
   already uses: Claude Code, Cursor, Gemini CLI, Codex, GitHub Copilot and Windsurf, each through its own hooks and
   MCP. Clients without hooks (claude.ai, Claude Desktop) call `get_team_rules` and `propose_memory` over MCP. In the
   terminal, `hivemind check --staged` flags code that breaks a locked rule before it's committed.
8. **It lives in the terminal, next to the agent.** `hivemind watch` runs in a split pane beside Claude Code (or any
   agent) and uses the website terminal's palette: no emoji, one honey ⬢ for Hivemind. It has four tabs. **Here**
   checks each file as it changes and shows any broken rule as a code frame: the line, the range underlined, the rule,
   who locked it, and the fix. **Rules** lists what applies, by layer, with who taught each one. **Queue** lets a lead
   approve with `a` or reject with `r`, and an approval plays a short honey-hex celebration ("@alex's lesson is
   live"). **Feed** shows what every agent on the team is doing, labeled by tool. `hivemind statusline` prints one line
   for Claude Code's status bar: "⬢ Hivemind · N rules · N waiting". The web app (Approvals, Results) has the same
   queue and the eval, for people who'd rather click.

## How it's different from Greptile, CodeRabbit and the rest

The closest products are AI code reviewers. **Greptile** and **CodeRabbit** both learn a team's preferences from PR
comments, replies and reactions, and apply them in their next reviews. That's a good product, and it's a different
moment: a review bot sees the code **after** an agent wrote it and someone opened a PR. Hivemind puts the lesson in
front of the agent **before** it writes anything.

| | Learns from | When it acts | Who gets it | Who decides what's learned |
|---|---|---|---|---|
| **Greptile, CodeRabbit** | PR comments, replies, 👍/👎 | In review, after the PR is open | Their own review bot (Greptile's MCP lets an agent look rules up if it asks) | Inferred from team behavior, edited in a dashboard |
| **GitHub Copilot Memory** | Copilot's own work in a repo | Copilot sessions | Copilot only, one repo; unused memories expire after 28 days | Copilot, checked against the code |
| **CLAUDE.md, Cursor rules, AGENTS.md** | Whatever someone remembers to write down | Session start | One file per vendor, per repo | Whoever edits the file |
| **Mem0, Zep, Letta** | One user's or one app's conversations | Wherever a developer wires it in | Building blocks for one agent | The app |
| **Hivemind** | Corrections typed to *any* agent, plus review comments | Session start, and on every file edit | Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf, any MCP client | A named lead approves. Agents can only propose. Locked rules can't be overridden |

What that means in practice:

- **Prevention, not detection.** In our eval, without the lesson the agent broke the team's rule in 22 of 36 runs. A
  review bot could catch some of those in review, after the agent wrote them and a person read the diff. With
  Hivemind the agent broke it in 0 of 36, so there was nothing to catch.
- **It learns from the corrections review bots never see.** Most "no, not like that" happens inside the agent's chat,
  before anything is pushed. It never reaches a PR, so a PR-based tool can't learn from it.
- **One memory for every vendor.** Greptile's learnings live in Greptile, Copilot's in Copilot, Cursor's rules in
  Cursor. Teams run several agents at once, and no single vendor has a reason to share its memory with competitors.
- **Governed.** A memory every agent trusts is an attack surface (OWASP lists memory poisoning as ASI06). Agents can
  only propose, a person approves, and locked rules block contradicting lessons with two independent checks.
- **It works alongside a review bot.** Keep Greptile or CodeRabbit for review. Their comments are exactly the kind of
  input Hivemind turns into lessons (a PR-comment importer is on the roadmap).

## Built to scale: cost, tokens, setup

- **One command, no new habits.** `hivemind init` writes each tool's own hook and MCP config for the agents a repo
  already uses. Engineers keep their agent and their terminal. The web app is for leads approving lessons.
- **A fixed token budget.** The context pack is capped at 6,000 characters (under 2,000 tokens) however many lessons
  the company has. Lessons are ranked and the pack is filled to the cap; only locked rules skip the line. In the eval
  the pack was 2,573 characters, under 1,000 tokens. Pasting every rule into every prompt grows with the company.
  This doesn't.
- **Measured cost, from the eval's own billing.** A session with Hivemind cost $0.024 on average, against $0.022
  without it: the pack adds about two tenths of a cent. But only 14 of 36 runs without memory passed, so the **cost per
  correct result fell from $0.055 to $0.024 (57% less)**. That's before counting the reviewer who has to catch each
  of the 22 failures, type the correction and wait for a rerun.
- **No model on the hot path.** Session start and every file edit are database reads and plain code, with no LLM call.
  Claude Haiku runs only when someone corrects an agent, and a no-model filter drops "lgtm", bots and one-offs first.
  Cost grows with corrections, not with sessions or edits.
- **More valuable as the team grows.** One approved correction reaches every engineer's next session, so on a team
  of N engineers it saves up to N−1 repeat corrections. Evidence from more people raises a lesson's confidence, and
  the approved lessons, with who taught them and why, become a company asset that builds up over months.
- **Fits inside the agents' limits.** The pack respects Claude Code's 10,000-character hook cap, a correction is
  captured within the 5-second hook timeout, and anything slower finishes in the background so the agent never waits.
- **Plain, horizontal parts.** One Next.js app on Vercel (UI, API and MCP server) and Postgres. Scopes (org → team →
  repo → personal) match how companies are already organized, so a new team is a new row, not a new deployment.

We built Hivemind for AI training-data teams like AfterQuery's, so the demo company is **Meridian Data**, a fictional
AI training-data company with two lab customers (Lab A, Lab B),
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
| PLACEBO | similar-length pack of 12 unrelated lessons | 15/36 (42%) | 21 runs |
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
- **Terminal app:** `hivemind watch` is plain ANSI with zero dependencies: alternate screen, line-diffed redraws, raw
  keys, resize, a non-TTY log mode, and `NO_COLOR` / reduced-motion support. It polls `/api/activity/live` every 2 s,
  and `fs.watch` sends changed files to the same check endpoint `hivemind check` uses.
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

## Why it fits each prize

- **Grand Tech (Continual Learning).** The track's four questions: it gets better the more people use it (every
  correction becomes a lesson, and confidence moves with every session); learning is the product, not an add-on;
  a product that never learns can't help with rules that exist only in someone's correction; and it's worth more as
  the team grows. The eval measures it: 14/36 → 36/36, placebo 15/36.
- **Continual Failure Detection (Lemma).** Failures are defined by people, not a model's opinion: an engineer
  correcting the agent, an edit to a file a locked rule governs, two agents in one file within 10 minutes. Each is
  flagged inside the agent's own loop while it works, and each correction becomes a lesson, so the same failure
  doesn't come back. A bad lesson trying to get in is itself a failure, and it's blocked.
- **Most Scalable To $1B (Outcast Ventures).** Per seat for every engineer who uses an agent, vendor-neutral, a fixed
  token budget per session, no model on the hot path, and a moat that compounds: a company's approved lessons.
- **Best Visual Design (Figma).** The main surface is a terminal, designed like a product: `hivemind watch` in a
  split pane with the website's palette, code frames instead of popups, no emoji, a single honey ⬢ as the mark, and
  one short celebration when a lesson goes live. Color means the same thing in the terminal, the web app and the
  site: honey = a lesson, rose = a locked rule, blue = interface. The web app keeps one question per screen.

## Built with

`next.js` · `typescript` · `react` · `tailwindcss` · `shadcn/ui` · `motion` · `codemirror` · `supabase` ·
`postgresql` · `anthropic` · `claude-code` · `claude-haiku` · `claude-sonnet` · `model-context-protocol` ·
`mcp-handler` · `zod` · `node.js` · `vercel` · `pnpm` · `cursor` · `gemini-cli` · `codex` · `github-copilot` · `windsurf`

---

## Build status (internal, delete before submitting)

Checked against `origin/main` at **234e8b4, Sat Oct 17, ~12:15 AM PT** (terminal pivot). Only ✅ rows may be described as working in
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
| Visible "Hivemind · Loaded N team rules for #repo/…" line at session start | ✅ | `hooks/session-start.mjs` |
| VS Code overlay (agent H) | dropped from the demo and pitch (Michael, 17 Oct 07:08 UTC); code stays in the repo | `vscode-extension/` |
| `hivemind watch` shell: tabs, keys, 2 s polling, teach input, toasts, code frames | ✅ 234e8b4 | `cli/watch/app.mjs`, `frame.mjs` |
| watch views: Here (code frames), Queue (`a` / `r`), Rules, Feed, the celebration | ✅ as working stubs; agents J / I / H are finishing them. Re-check before recording | `cli/watch/views/`, `celebrate.mjs` |
| `hivemind statusline` ("⬢ Hivemind · N rules · N waiting") | ✅ stub. `hivemind init` doesn't wire it yet: add `statusLine` to `.claude/settings.json` by hand for the video | `cli/watch/statusline.mjs` |
| `hivemind check <file…>` / `--staged [--fix]` (code frames, exits 1 on a locked rule) | ✅ | `cli/lib/check.mjs` |
| Hook lines in plain "Hivemind · …" wording, no emoji | ✅ cee7840 | `src/lib/engine/pipeline.ts`, `hooks/` |
| MCP chat cards for `get_team_rules` / `propose_memory` (MCP Apps) | ✅ | `src/app/api/mcp/` |
| Vercel deploy (live link): https://hivemind-beta-virid.vercel.app | ✅ auto-deploys from main | `docs/deploy.md` |
| Decay, invalidation, PR-comment importer | roadmap | |
