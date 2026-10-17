# Hivemind learning engine

Every correction an engineer gives any AI agent turns into a lesson every agent at the company learns, and it goes through a chain of command: locked rules always win, agents can only propose, and owners approve.

Code lives in `src/lib/engine/` (`extract`, `merge`, `conflict`, `score`, `pipeline`, `prompts`, `llm`). Routes: `POST /api/events`, `POST /api/hooks/prompt`, `POST /api/hooks/session-end`.

## Pipeline

```
event ─► ① filter     no LLM: drop short / "lgtm" / bot / slash-command echoes
      ─► ② extract    ≤3 candidates {title, body, rule|fact|one_off|noise, scope repo|team, confidence}
                      keep only rule/fact with confidence ≥ 0.75; also rate served context-pack items helpful/harmful
      ─► ④ conflict   vs 🔒 locked memories in the scope chain → status=blocked, status_reason='Contradicts @<owner>'s locked rule "<title>".'
      ─► ③ merge      Mem0-style ADD / UPDATE / DELETE / NONE against unlocked pending+active lessons in the scope chain
      ─► ⑤ approve    every learned lesson stays pending until its scope owner (lead) or security approves it
session end ─► ⑥ score  α/β update for every memory served in that session's context pack
```

For latency, conflict and merge run in parallel, but the conflict verdict is applied first. A lesson that contradicts a locked rule never gets merged, so it can't strengthen or overwrite anything.

### Chain of command (no auto-promotion)
Evidence never changes a lesson's status. A duplicate from a second engineer (or a lead's review comment) appends evidence and raises α, so the approver sees stronger confidence, but the lesson stays `pending` until a lead or security approves it in the inbox. Superseding works the same way: a DELETE decision proposes a new pending lesson marked "Would supersede [[old]]". The old lesson is only retired by a human decision.

### Guardrails (locked always wins)
We hardened these after testing with the real model. Each one fixes a failure we actually saw:
1. **Belt and braces:** a candidate is blocked if Haiku *or* the deterministic polarity guard says it contradicts a 🔒 rule. Low-effort Haiku once missed "mixing Lab A and Lab B data is fine in tests".
2. **Guard the raw words:** the deterministic guard also runs on the engineer's original message. The extractor once "sanitized" the bad lesson into the policy itself. When only this guard fires, the blocked row keeps the engineer's own sentence, so the reviewer sees what was actually said.
3. **Never merge into a 🔒 rule.** Locked memories are not merge targets at all. A correction that agrees with or overlaps a locked rule becomes its own pending lesson, linked as `Related: 🔒 [[slug]]`. Only a *contradiction* of a locked rule results in `blocked`. (Earlier, a correction mentioning `assertSingleCustomer()` was absorbed as evidence into Greg's lab-isolation rule, because that rule's text mentions the function.)
4. **Human text is never rewritten:** an UPDATE replaces the body only for engine-authored lessons (`source` correction/review/agent). Seeded or human lessons just gain evidence and α.
5. The extractor is told to restate faithfully, even when the message contradicts served memories, so the guardrail and not the extractor decides what's allowed.
6. **Reinforcement safety net:** if Haiku returns no rule for a correction or review comment, a heuristic restatement that clearly duplicates an existing lesson still counts as evidence. It can never create a new lesson (`reinforceOnly`).
7. **Violations are always visible:** if Haiku extracts nothing, but the engineer's message contradicts a 🔒 rule, the message is still recorded as a `blocked` lesson in the engineer's own words. Haiku occasionally declined "mixing Lab A and Lab B data is fine in tests", and then the guardrail had nothing to show.

People are always mentioned as **@handles** (person id), e.g. `Waiting on @ben.` and `@greg's locked rule`, matching the UI's @person chips.

### Event sources
| Source | Route | Event type | Weight w |
|---|---|---|---|
| Claude Code `UserPromptSubmit` hook (engineer types to their agent) | `/api/hooks/prompt` | `correction` (kept only if the classifier judges it a correction; "Say OK." is not stored) | by role |
| PR review comment (`scripts/learn-from-prs.mjs`, UI) | `/api/events` | `review_comment` | by role |
| Agent self-report (MCP `propose_memory`) | `/api/events` | `agent_proposal` | 0.3 |
| Code fix (watcher: a human fixes agent/other-person code) | `/api/events` | `fix` | by role |
| Claude Code `SessionEnd` hook | `/api/hooks/session-end` | `session_end` | 1 |

**Attribution:** `x-hm-user` → `events.actor` (including `session_end`). `x-hm-agent` (default `claude-code` on hook routes) → `events.agent`, and fills `pack_log.agent` at session end if the pack didn't set it.

**Role weights:** security / lead 2.0, engineer 1.0, agent 0.3 (from `people.role`).

**Scope guess:** the repo comes from `x-hm-repo` or `repo/<basename(cwd)>`. A lesson's scope is the repo, or the repo's team if the extractor marks it team-general. Unknown repos are registered automatically under the actor's team.

### Merge actions (step ③)
| Decision | Effect |
|---|---|
| ADD | new memory, `status=pending`, `α = 1 + w`, `β = 1`, evidence `[e]` |
| NONE (duplicate) | append evidence, `α += w`; status unchanged |
| UPDATE | as NONE, and the body is replaced with the merged text, but only for engine-authored lessons (never locked or human text) |
| DELETE | new pending memory with `status_reason="Would supersede …"` and a `[[old-slug]]` link. Nothing is retired automatically. On approval the old one should become `status=invalid` / `invalidated_by` (Graphiti's "invalidate, don't delete"); nothing is ever hard-deleted. |

### Hook feedback
`/api/hooks/prompt` answers within 4.6s; the Claude Code hook timeout is 5s. With Haiku, a full capture (extract, then conflict ‖ merge, plus DB writes) takes about 3–4s. Measured locally: 3.2–3.8s per hook call; the heuristic path takes about 0.3–0.5s. If the pipeline runs past the budget, the route returns `{}` and Next's `after()` finishes the learning in the background, so the lesson still lands. When something is learned, the hook returns the line twice. As `systemMessage` the engineer sees it in Claude Code; as `additionalContext` the agent sees it. The docs say UserPromptSubmit `additionalContext` "doesn't produce a visible transcript entry", so `systemMessage` is what makes it visible.

| Event | Line (plain text, no emoji, no ANSI) |
|---|---|
| New lesson, or evidence added to a still-pending one | `Hivemind · Lesson captured: "Every export calls assertSingleCustomer()". Waiting on @ben.` |
| Contradicts a locked rule | `Hivemind · Blocked: contradicts @greg's locked rule "Never mix data from different lab customers".` |
| Evidence added to an already-approved lesson | `Hivemind · Lesson reinforced: "…" is already a team rule.` |
| Collision (`/api/hooks/tool`, PostToolUse) | `Hivemind · Heads up: @kevin's Cursor agent edited src/export.ts 2 min ago.` (or `just now`) |
| Session start (`hooks/session-start.mjs`) | `Hivemind · Loaded 10 team rules for #repo/export-service.` |

The blocked lesson's stored reason (`status_reason` / `blockedReason`) reads `Contradicts @greg's locked rule "Never mix data from different lab customers".`

**Why no colour:** Claude Code's hooks docs say nothing about ANSI in `systemMessage` or `additionalContext`, and the hooks' `terminalSequence` field explicitly rejects CSI colour sequences. Escape codes in `additionalContext` would also end up in the model's context. So the lines are plain text.

The wording comes from Adrian's brand spec (`public/brand/vscode/`) and is mirrored in `src/components/site/demo-script.ts`. Keep them identical.

## Learning from fixes

Typed corrections are only half the signal. When someone fixes code that an AI agent or another person wrote, the fix *is* the correction. Hivemind turns the convention the fix enforces into a lesson, and every agent follows it from then on.

**Input:** `POST /api/events` with `type: "fix"`. The payload is `{ file, diff (unified, capped at 4KB), before?, after?, previousAuthor ("agent:claude-code" | "@kevin"), violationRuleId?, url?, line? }`. Agent J's watcher (`hivemind watch`) sends these whenever a human edits agent-written code. If `line` is missing, it's read from the diff's `@@` hunk header. If `diff` is missing, it's built from `before`/`after`.

**Pipeline** (`src/lib/engine/fix.ts` plus the `fix` branch in `pipeline.ts`):
1. **Known violation:** if `violationRuleId` (id or slug) names an existing rule, the fix is positive evidence for that rule. α += w, and an evidence entry is appended. No new lesson. Logged as `"<rule>" reinforced by @kevin's fix in src/experts.ts:6 (α 24→25)`.
2. **Cosmetic filter (no LLM):** whitespace, quote style, semicolons, comments, typos, import reordering, or renaming a symbol the diff itself declares → no lesson. Swapping one API for another (`console.log` → `logger.info`) is *not* cosmetic.
3. **Extract:** Haiku answers "what convention does this fix enforce?" (`FIX_SYSTEM`, adapted from cognee's `coding_rule_association` and mem0's fact-extraction few-shots). It classifies rule | fact | one_off | noise, keeps up to 2 rules at confidence ≥ 0.75, and says an empty list is fine.
   Heuristic fallback without a key: PII leaving a log call → "Log expert ids, never emails"; `console.*` → `logger.*` → "Use logger, not console.log"; a new `assert*/validate*/ensure*` call before a write → "Call assertSingleCustomer() before writing in export.ts"; one call swapped for another → "Use X() instead of Y()".
4. **Then the usual pipeline:** conflict vs 🔒 (blocked if it contradicts), merge (ADD / UPDATE / NONE against unlocked lessons), and the lesson **stays pending until a lead approves it**. A fix never auto-approves anything.

**Provenance:** the evidence has `type: "fix"`, `quote` = a diff excerpt (changed lines only, e.g. `- console.log(user.email);\n+ logger.info({ expertId: user.id });`), `url` = the permalink, `file`, `line`, and `actor` = who fixed it. The lesson body ends with `Learned from @kevin's fix in src/experts.ts:6 · #repo/export-service`. The event's payload stores the normalized `{file, line, url}`. Lessons learned from fixes keep `source: "correction"`, so the UI needs no new source type.

**Messages** (returned as `message` by `/api/events`, so the watcher, CLI and extension can render them verbatim; one line per lesson):
- `Hivemind · Lesson captured from @kevin's fix in src/experts.ts:6: "Log expert ids, never emails". Waiting on @ben.`
- `Hivemind · Lesson reinforced by @kevin's fix in src/experts.ts:6: "Never log expert personal info".` (known violation, or a duplicate of an approved lesson)
- `Hivemind · Blocked: @kevin's fix in src/experts.ts:6 contradicts @greg's locked rule "<rule>".`

Corrections that name a file (`payload.file`/`line` on `/api/events`) also get `in <file>:<line>`, e.g. `Hivemind · Lesson captured in src/export.ts:23: "…". Waiting on @ben.` Hook prompts carry no file, so their lines are unchanged.

## Confidence math (`score.ts`)

Each memory has a Beta(α, β) posterior over "following this lesson is right". The prior is Beta(1, 1).

- Evidence for the lesson: α += w. Evidence against it: β += w.
- Posterior mean: `p = α / (α + β)`.
- Ranking uses the Wilson lower bound (Evan Miller), with z = 1.96, `n = max(α + β − 2, 1)`:

  `LB = (p + z²/2n − z·√((p(1−p) + z²/4n)/n)) / (1 + z²/n)`

  A lesson confirmed by many people outranks one with the same mean and less evidence.
- Session-end scoring, for each memory served in the session's `pack_log` (locked ones are skipped and never decay):
  - rated **helpful** by the correction detector, or **no correction in the session touched its topic** → α += 1
  - rated **harmful**, or contradicted by a correction (same topic, opposite polarity) → β += 1
  - touched but not contradicted (the engineer re-stated it) → no change
  - `pack_log.corrections` is set to the number of correction events in the session. That number drives the learning curve (corrections per session ↓).
  - Idempotent: a second `SessionEnd` for the same session is a no-op.
- Optional decay (pitch only): `α ← 1 + (α−1)·0.5^(Δt/60d)`.

## LLM vs heuristic paths (`llm.ts`)

Each step calls Claude Haiku 5.5 (`claude-haiku-5-5`) with **structured outputs** (`output_config.format` from a zod schema via `client.messages.parse`). Thinking is disabled, effort is `low`, the timeout is 4s and there are no retries. Haiku 5.5 rejects non-default `temperature`, so determinism comes from the JSON schema instead.

If there's no `ANTHROPIC_API_KEY`, or the call times out, refuses, or fails to parse, the step falls back to a deterministic heuristic. The server log says which path ran (`[engine] extract via llm — …` / `via heuristic`). Set `HIVEMIND_ENGINE_MODE=heuristic` to force the fallback.

Heuristics:
- **extract:** correction cues (`no / don't / never / always / instead / use X not Y / must / is fine`). Sentences with one-off cues (`rename`, `this variable`, `here`, `line 12`, `for now`) and requests or questions are dropped.
- **conflict:** at least 2 shared significant stems with a locked rule, plus opposite polarity (prohibit ↔ permit, or require ↔ prohibit/permit). "Never log PII" vs "always redact PII before logging" is *not* a conflict.
- **merge:** Jaccard ≥ 0.5, or a shared code identifier (`assertSingleCustomer()`) with ≥2 shared stems → duplicate (NONE). The same topic with opposite polarity → DELETE.

## Prompt attributions (all Apache-2.0, adapted in `prompts.ts`)
| Step | Source |
|---|---|
| Correction detector + served-item ratings ("Do not guess; if unclear, omit") | topoteretes/cognee `cognee/infrastructure/llm/prompts/feedback_detection_system.txt` |
| PR review comment → rule | topoteretes/cognee `cognee/infrastructure/llm/prompts/coding_rule_association_agent_system.txt` |
| Code fix → rule ("what convention does this fix enforce?") | topoteretes/cognee `coding_rule_association_agent_system.txt` + mem0ai/mem0 `FACT_RETRIEVAL_PROMPT` few-shot structure |
| Merge ADD/UPDATE/DELETE/NONE with short integer ids | mem0ai/mem0 `mem0/configs/prompts.py` `DEFAULT_UPDATE_MEMORY_PROMPT` |
| Contradiction vs locked rules ("only when both cannot be true; don't infer from recency") | getzep/graphiti `graphiti_core/prompts/dedupe_edges.py` `resolve_edge` |
| Invalidate-don't-delete | getzep/graphiti |
| Wilson score ranking | Evan Miller, "How Not To Sort By Average Rating" |

## Verify
```
pnpm dev -p 3102
node scripts/smoke-engine.mjs            # real correction, one-off (ignored), 2nd-actor duplicate (→ active),
                                         # bad lesson (→ blocked by 🔒), review comment (→ reinforces), session end (α/β)
```
The smoke covers corrections, a one-off, "Say OK.", a 2nd-actor duplicate (stays pending), the blocked lab lesson, a review comment, three fixes (real diff → lesson; rename → none; known violation → reinforced) and session-end scoring. 12/12 pass on Haiku 5.5. The heuristic path was 7/7 before the fix checks were added; the fix heuristics are covered by the cases in `fix.ts`.

The script resets its own rows first, including the evidence, α bumps and session scoring it applied to seeded rows, so repeated runs don't drift the demo data. Use `--no-reset` to keep them, or `--reset-only` to just clean up. It uses `scripts/seed.mjs` rows when they exist and only creates what's missing: demo scopes and people, Greg's 🔒 lab rule, and a "use logger" lesson.
