# Hivemind: judge Q&A

Two or three sentences per answer. Numbers come from `docs/eval.md`. Anything marked *(roadmap)* is not on `main`:
say so out loud if asked. Re-check the build status table in `devpost.md` before judging starts.

## Grand Tech: Continual Learning (AfterQuery, SideShift)

**Does your product get better the more people use it?**
Yes, and across people, not just for one user. Each correction from any engineer becomes a lesson that every
teammate's agent loads in its next session, and each extra person or session that confirms it raises its confidence
and its rank in the pack.

**Is learning core, not an add-on?**
Turn the learned lessons off and nothing is left: the product is the lessons. In our eval, the same agent with no
memory passed 14 of 36 runs and with the learned pack passed 36 of 36, and a same-size pack of unrelated lessons
passed 15, so the gain comes from what was learned.

**Does it solve a problem a product that never learns couldn't?**
A static `CLAUDE.md` or rules file only holds what someone remembered to write. The six conventions in our eval were
written nowhere in the repo. They existed only as past corrections, and the agent broke them in 22 of 36 runs until
it learned them.

**Does it grow more valuable as it scales?**
More engineers means more corrections, more evidence per lesson and more lessons that one team learns and another
team receives without paying for the mistake. Governance is what keeps scale from turning into noise: scoped lessons,
lead approval, and locked rules that always win.

**How is this different from Cursor Tab, Glean, Tolan, Mem0?**
Cursor Tab and Tolan learn one person's preferences. Glean searches what is already written. Mem0 is a memory library
for one user or agent. Hivemind learns rules from a whole team's corrections and serves them to every agent the team
uses, with a person approving what gets in.

**(AfterQuery) Why would a training-data company care?**
Every correction is a labeled failure written by an expert. Hivemind stores them structured, attributed and scoped,
which is the raw material for a company-specific eval set or rubric *(export: roadmap)*.

## Agent Behavior Monitoring (Lemma, Jerry Zhang)

**How do you decide what counts as a failure?**
Three signals, all defined by people and not by a model's opinion: a human correcting the agent, an edit that touches
a file governed by a 🔒 locked rule, and two agents editing the same file within 10 minutes. In the eval, failure is a
deterministic grader firing on the diff, with no LLM judge.

**How does your agent notice on its own when it's failing?**
A PostToolUse hook runs after every edit. It tells the agent, inside its own loop, when another person's agent just
edited the same file and which locked rules mention that file, so the agent can stop and check before the human has to.
Corrections typed to the agent are classified as they arrive and become pending lessons *(capture: landing tonight)*.

**Guardrails or retry loops?**
The guardrails are structural. Agents can only write `pending`. Promotion needs a human with the right role, and a
proposal that contradicts a locked rule is blocked *(auto-block: landing tonight)*. We don't auto-retry: the warning
goes back to the agent, and the agent decides with that information.

**How does it stay reliable as it runs longer?**
The pack is capped at 6,000 characters and ranked by the Wilson lower bound of each lesson's Beta score, so a growing
memory doesn't bloat context. Locked rules are always first. Lessons that get corrected against lose confidence and
drop out *(session-end scoring: landing tonight; time decay: roadmap)*.

**What happens when a lesson is wrong?**
Its owner can reject or edit it. A correction against it lowers its score. Contradicted lessons are marked `invalid`
with a pointer to what replaced them, not deleted, so you can see why the agent's behavior changed *(invalidation:
roadmap; the status exists in the schema)*.

## Most Scalable to $1B (Outcast Ventures)

**Is this a real problem in a large market?**
Atlassian's 2025 State of DevEx survey of 3,500 developers puts finding information as the top source of friction,
and half of developers lose 10+ hours a week to organizational inefficiencies. Every engineering org that runs coding
agents now has that problem multiplied, because each agent session starts with no context.

**Clear path to $1B?**
Per-seat pricing on every engineer who uses an agent, sold to the platform or security team, which already buys
seats for Copilot, Cursor and Glean. At Unblocked's listed ~$19/user/month, $1B ARR is about 4.4M seats; an org
tier with locked rules, audit and SSO priced higher needs proportionally fewer. We have not validated a price with a
customer yet.

**Would someone pay today?**
Teams already pay for adjacent tools: Unblocked lists plans from about $19/user/month (third-party listing) to answer
questions from docs, and that doesn't learn. A lead who is tired of making the same review comment is the first buyer.
Security is the second, because locked rules and approval are something they need before they allow agents near
customer data.

**Why now?**
In 2026 engineers run several agents at once, from different vendors, and each vendor's memory stays inside its own
product. MCP and agent hooks are now supported widely enough that one memory can plug into all of them. And memory
poisoning has its own OWASP entry (ASI06, Top 10 for Agentic Applications 2026), so ungoverned shared memory is now a
known risk.

**What's the moat?**
The approved lessons themselves: a company's conventions, with who taught them and evidence, accumulated over months.
Plus vendor neutrality: no single agent vendor has a reason to make its memory work with its competitors.

## Best Visual Design (Figma, Michelle Liu)

**What design decisions did you make?**
One question per screen: Lessons shows what the team knows, Approvals asks one decision at a time with A / R keys,
Results shows the eval. Light page, near-black text, one blue accent for interaction. Honey marks lessons only and
red marks locked rules only, so color always means the same thing.

**What makes it distinct?**
Lessons read as text with inline chips (`#repo/export-service`, `@jordan`, `[[lesson]]`) instead of forms. Hivemind
also shows up where engineers already are, in the agent's terminal and the editor, so the web app stays small.

**Why a hive?**
Each cell is a lesson, and the hive fills in as the team learns. It shows the three states (at rest, learning,
everyone knows) without a chart.

## Kaushal Patel (training data, ChatGPT infra, evals)

**Is the eval rigorous?**
It has a placebo arm of the same size (15/36, same as OFF's 14/36), held-out tasks whose wording never went into any
lesson (3/12 → 12/12), deterministic graders checked against 16 hand-written cases, `--safe-mode` so nothing leaks in,
and a task-level sign test (ON beat OFF on 8 tasks, lost on 0, p = 0.0078). Raw diffs are committed in `eval/out/`.

**What are its weaknesses?**
It's small: 12 tasks we wrote, one fixture, one model, 3 runs per arm, and 4 tasks that OFF already passed. ON serves
a curated pack, so it measures whether agents follow lessons once served, not retrieval quality. We also wrote the
lessons in the extractor's format instead of extracting them live during the eval.

**Is the dashboard data real?**
The 14-day session history is synthetic, generated by `scripts/seed-history.mjs` and flagged `synthetic` in the API.
The eval is the only measured result, and we say that in the docs and the video.

**What would you run next?**
The same eval with the live ranked pack from `/api/context-pack`, more tasks from a real repo, and a second model.
Then a retrieval metric: how often the right lesson makes it into a 6k-character pack as memory grows.

## ShiaoFong Yin (TEALE Group)

**Who buys it, and how do you get in?**
The engineering lead of a team already using Claude Code or Cursor, bottom-up and free for one team. It expands when
the security or platform team wants org-wide locked rules and approval logs, which is the paid tier.

**What's the go-to-market risk?**
Agent vendors adding their own team memory. Our answer is that teams use more than one vendor and want one memory
with one approval process across all of them.

## Tough follow-ups

**Memory poisoning: can't an agent or attacker write a bad lesson that every agent trusts?**
Agents can only propose. Every lesson needs a human with the right role for that scope to approve it, and anything
that contradicts a locked rule is blocked *(auto-block: landing tonight)*. Lessons carry evidence and an author, so a
bad one can be traced and rejected. This is the attack OWASP lists as ASI06, and it's the reason governance is in the
data model and not in a prompt.

**Privacy and surveillance: are you recording what engineers type?**
We store lessons and the correction quoted as evidence, plus which file each agent edited and when. We don't store
whole transcripts. Each lesson is attributed so people get credit, and a self-hosted deployment plus per-scope
opt-out is how this would ship *(roadmap)*. Corrections are about code, and the product never scores individual
engineers.

**Why not just CLAUDE.md?**
CLAUDE.md only holds what someone wrote down, it's per repo and per vendor, and it never notices when it's out of date.
Our six eval conventions weren't in any file, and the agent broke them 22 of 36 times. Hivemind learns them from
corrections, ranks them, scopes them org → team → repo, and serves them to every tool.

**GitHub will build this.**
GitHub already shipped Copilot Memory: it's per repository, only Copilot uses it, and unused memories expire after
28 days. Factory's org memory works for Factory's agents, and Cursor Team Rules are hand-written. A team using three
agent vendors needs memory none of them owns.

**Isn't this Mem0 / Zep / Letta?**
Those are memory infrastructure for building agents. Hivemind is a product for engineering teams: scopes, roles,
approvals, locked rules, collision warnings and editor and agent integrations. We borrowed Mem0's merge prompts and
Graphiti's invalidation idea.

**Pricing?**
Free for one team. Paid per seat for the org tier (locked rules, SSO, audit log, more scopes), in the range companies
already pay for Unblocked or Glean. We haven't priced it with a real customer yet.

**Cold start: what does a new team get on day one?**
Locked rules and directives that leads write in a couple of minutes, plus whatever the first week of corrections
teaches. A PR-review-comment importer can backfill lessons from past reviews *(roadmap)*.

**What if two lessons conflict?**
Locked rules always win. Between unlocked lessons, the more specific scope ranks higher (repo over team over org)
and then confidence decides. A lead can mark the loser invalid.

**Doesn't more context make the agent worse?**
The pack is capped at 6,000 characters and ranked. In the eval, the ON pack held 6 relevant lessons among 6
distractors and still passed 36 of 36.

**Does it work with tools other than Claude Code?**
Today Claude Code works end to end through hooks, and any MCP client can use `search_memory` and `propose_memory`.
Adapters for Cursor, Gemini CLI, Copilot, Codex and Claude chat, `hivemind init`, and a VS Code extension are being
built tonight *(update this answer from the build status table before judging)*.

**What did you build at the hackathon vs before?**
All of it was built at the event: the first commit is Fri Oct 16, 7:23 PM PT, and the history is public.
