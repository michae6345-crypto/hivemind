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
3. **Never merge into a 🔒 rule.** Locked memories are not merge targets at all. A correction that agrees with or overlaps a locked rule becomes its own pending lesson, linked as `Related: 🔒 [[slug]]`. Only a *contradiction* of a locked rule results in `blocked`. (Earlier, a correction mentioning `assertSingleCustomer()` was absorbed as evidence into Maya's lab-isolation rule, because that rule's text mentions the function.)
4. **Human text is never rewritten:** an UPDATE replaces the body only for engine-authored lessons (`source` correction/review/agent). Seeded or human lessons just gain evidence and α.
5. The extractor is told to restate faithfully, even when the message contradicts served memories, so the guardrail and not the extractor decides what's allowed.
6. **Reinforcement safety net:** if Haiku returns no rule for a correction or review comment, a heuristic restatement that clearly duplicates an existing lesson still counts as evidence. It can never create a new lesson (`reinforceOnly`).
7. **Violations are always visible:** if Haiku extracts nothing, but the engineer's message contradicts a 🔒 rule, the message is still recorded as a `blocked` lesson in the engineer's own words. Haiku occasionally declined "mixing Lab A and Lab B data is fine in tests", and then the guardrail had nothing to show.

People are always mentioned as **@handles** (person id), e.g. `pending approval by @jordan` and `(@maya)`, matching the UI's @person chips.

### Event sources
| Source | Route | Event type | Weight w |
|---|---|---|---|
| Claude Code `UserPromptSubmit` hook (engineer types to their agent) | `/api/hooks/prompt` | `correction` (kept only if the classifier judges it a correction; "Say OK." is not stored) | by role |
| PR review comment (`scripts/learn-from-prs.mjs`, UI) | `/api/events` | `review_comment` | by role |
| Agent self-report (MCP `propose_memory`) | `/api/events` | `agent_proposal` | 0.3 |
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
| New lesson, or evidence added to a still-pending one | `Hivemind · Lesson captured: "Every export calls assertSingleCustomer()". Waiting on @jordan.` |
| Contradicts a locked rule | `Hivemind · Blocked: contradicts @maya's locked rule "Never mix data from different lab customers".` |
| Evidence added to an already-approved lesson | `Hivemind · Lesson reinforced: "…" is already a team rule.` |
| Collision (`/api/hooks/tool`, PostToolUse) | `Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago.` (or `just now`) |
| Session start (`hooks/session-start.mjs`) | `Hivemind · Loaded 10 team rules for #repo/export-service.` |

The blocked lesson's stored reason (`status_reason` / `blockedReason`) reads `Contradicts @maya's locked rule "Never mix data from different lab customers".`

**Why no colour:** Claude Code's hooks docs say nothing about ANSI in `systemMessage` or `additionalContext`, and the hooks' `terminalSequence` field explicitly rejects CSI colour sequences. Escape codes in `additionalContext` would also end up in the model's context. So the lines are plain text.

The wording comes from Adrian's brand spec (`public/brand/vscode/`) and is mirrored in `src/components/site/demo-script.ts`. Keep them identical.

