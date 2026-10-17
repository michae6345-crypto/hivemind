# Hivemind learning engine

Every correction an engineer gives any AI agent turns into a lesson every agent at the company learns, and it goes through a chain of command: locked rules always win, agents can only propose, and owners approve.

Code lives in `src/lib/engine/` (`extract`, `merge`, `conflict`, `score`, `pipeline`, `prompts`, `llm`). Routes: `POST /api/events`, `POST /api/hooks/prompt`, `POST /api/hooks/session-end`.

## Pipeline

```
event ─► ① filter     no LLM: drop short / "lgtm" / bot / slash-command echoes
      ─► ② extract    ≤3 candidates {title, body, rule|fact|one_off|noise, scope repo|team, confidence}
                      keep only rule/fact with confidence ≥ 0.75; also rate served context-pack items helpful/harmful
      ─► ④ conflict   vs 🔒 locked memories in the scope chain → status=blocked, status_reason="Conflicts with 🔒 <title> (<owner>)"
      ─► ③ merge      Mem0-style ADD / UPDATE / DELETE / NONE against pending+active lessons in the scope chain
      ─► ⑤ promote    evidence from ≥2 distinct humans → active (otherwise pending for the scope owner)
session end ─► ⑥ score  α/β update for every memory served in that session's context pack
```

The conflict check runs before the merge on purpose. A lesson that contradicts a locked rule never reaches the merge step, so it can't strengthen or overwrite anything.

### Event sources
| Source | Route | Event type | Weight w |
|---|---|---|---|
| Claude Code `UserPromptSubmit` hook (engineer types to their agent) | `/api/hooks/prompt` | `correction` | by role |
| PR review comment (`scripts/learn-from-prs.mjs`, UI) | `/api/events` | `review_comment` | by role |
| Agent self-report (MCP `propose_memory`) | `/api/events` | `agent_proposal` | 0.3 |
| Claude Code `SessionEnd` hook | `/api/hooks/session-end` | `session_end` | 1 |

**Role weights:** security / lead 2.0, engineer 1.0, agent 0.3 (from `people.role`).

**Scope guess:** the repo comes from `x-hm-repo` or `repo/<basename(cwd)>`. A lesson's scope is the repo, or the repo's team if the extractor marks it team-general. Unknown repos are registered automatically under the actor's team.

### Merge actions (step ③)
| Decision | Effect |
|---|---|
| ADD | new memory, `status=pending`, `α = 1 + w`, `β = 1`, evidence `[e]` |
| NONE (duplicate) | append evidence, `α += w`, check promotion |
| UPDATE | as NONE, and the body is replaced with the merged text (locked bodies are never rewritten) |
| DELETE | new pending memory. The old one gets `status=invalid` and `invalidated_by=<new id>`. Nothing is hard-deleted (Graphiti's "invalidate, don't delete"). Agents can't invalidate. A DELETE aimed at a locked memory blocks the new lesson. |

### Hook feedback
`/api/hooks/prompt` answers within about 3.5s; the Claude Code hook timeout is 5s. If the pipeline runs longer, Next's `after()` finishes it in the background. When something is learned, the agent sees a message like:

- `📝 Hivemind captured a lesson: "Exports must call assertSingleCustomer() before writing" — pending approval by Jordan Reyes`
- `🚫 Hivemind blocked "Mixing Lab A and Lab B data is fine in tests": conflicts with 🔒 Never mix data from different lab customers (Maya Chen)`
- `✅ Hivemind: "…" is now confirmed by multiple engineers — active for every agent`

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
The script resets its own rows first (`--no-reset` to keep them). It creates only the fixtures it needs: demo scopes and people, Maya's 🔒 lab rule, and a "use logger" lesson. Existing seed rows are left alone.
