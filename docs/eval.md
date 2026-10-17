# Does Hivemind make agents better? Eval method and results

**Short answer:** on 12 small coding tasks in a fictional repo, headless Claude Code (Sonnet 5.5) without memory violated
the team's unwritten conventions in 22 of 36 runs. With the Hivemind context pack it violated them in **0 of 36**. A
placebo pack of the same size, holding unrelated lessons, did not help (21/36). The tasks marked held-out, whose
lesson text was written from a *different* task, improved just as much: 9/12 → 0/12.

Everything below can be reproduced from `eval/`. Raw per-run diffs and grades are committed in `eval/out/`.

## Setup

**Fixture.** `eval/fixture/` is a tiny TypeScript "export-service" for a fictional data company. It exports
annotation data for lab customers ("Lab A / Lab B") and pays experts. The helpers the conventions need are already
there (`logger`, `assertSingleCustomer`, `toUtcIso`). Some legacy code even breaks the conventions (one
`console.log`, a dollar-valued `amount`). **No README, comment or doc in the fixture states any of the conventions.**

**Six conventions.** Each one exists *only* as a human correction or review comment, which Hivemind distills into a
lesson (`eval/lessons.json`):

| Convention | Lesson (as served) | Grader (`eval/check.mjs`) |
|---|---|---|
| `use-logger` | use `logger`, never `console.*` | added `console.(log\|info\|warn\|error\|debug)(` in `src/` |
| `export-assert-single-customer` | anything that uploads export rows calls `assertSingleCustomer(rows)` | changed `src/exports/*` file adds `upload(` but never calls `assertSingleCustomer(` |
| `money-integer-cents` | money is integer cents | fractional numeric literal, `parseFloat`, or `*100)/100` in added payout code (string contents ignored) |
| `migrations-append-only` | never edit existing migrations | any pre-existing `migrations/*` file modified or deleted |
| `sec-no-pii-logs` (🔒) | never log expert email/phone or whole expert objects | new log call containing `email`/`phone` or a whole `expert`/`changes`/`before`/`after` object |
| `dates-to-utc-iso` | format timestamps with `toUtcIso()` | added `.toISOString(`/`toLocale*String(`/…, or, for date tasks, `toUtcIso(` never used |

**12 tasks** (`eval/tasks/*.json`), 2 per convention. Each is an ordinary feature request that tempts one convention
(for example "add a $2.50/day late penalty" or "log enough detail for support to contact the expert"). No task prompt
mentions any convention.

**Held-out split (4 tasks).** For `export-assert-single-customer`, `money-integer-cents`, `sec-no-pii-logs` and
`dates-to-utc-iso`, the lesson text and its evidence quote came from the correction on the *first* task only. The
second task (`tenancy-merge`, `cents-penalty`, `pii-contact-audit`, `dates-link-expiry`) never contributed any text. A
held-out pass therefore means a lesson learned on one task carried over to a different one. For `use-logger` and
`migrations-append-only`, both tasks contributed evidence, so both count as "seen". `eval/lessons.json` records `learnedFrom`
for every lesson, and no held-out task id appears in it.

**Arms.**
- **OFF**: the task prompt only.
- **ON**: the Hivemind context pack (2.6k chars) prepended in the same `<session-context>` wrapper the SessionStart hook
  uses. It holds the 6 lessons **plus 6 unrelated distractor lessons** (idempotent jobs, pnpm, PR size, …), sorted
  alphabetically so the relevant lessons aren't listed first.
- **PLACEBO**: a pack of the same format and similar length (2.0k chars) with 12 distractor lessons and none of the six.
  It tests whether "any extra context makes the agent more careful".

**Harness** (`eval/run.mjs`). Every run gets a fresh temp copy of the fixture and then runs
`claude -p --safe-mode --no-session-persistence --model claude-sonnet-5-5 --permission-mode acceptEdits --tools Read,Edit,Write,Glob,Grep`.
`--safe-mode` disables CLAUDE.md, plugins, hooks, MCP and auto-memory, so nothing outside the prompt leaks in. The
runner diffs the result against the pristine fixture and grades it deterministically. There is no LLM judge. Runs go
6 at a time, and every run used the developer's Claude Code login.

**Metrics.**
- *Pass*: the expected files were touched (the task was actually done) AND none of the six graders fired. This covers
  collateral violations, such as a `console.log` slipped into a payout task.
- *Target violation*: the grader for the task's own convention fired.
- *Violations per task*: the mean number of conventions violated per run.

**Grader validation.** `node eval/check.selftest.mjs` runs 16 hand-written compliant and violating solutions covering
every convention. All 16 are graded correctly. I also spot-checked raw diffs in `eval/out/` by hand.

## Results: n = 12 tasks × 3 runs = 36 runs per arm, 0 errored runs

| Arm | Runs | Pass | Pass rate (95% Wilson CI) | Target violations | Violations / task |
|---|---|---|---|---|---|
| OFF | 36 | 14 | **39%** (25–55%) | 22 | 0.78 |
| PLACEBO | 36 | 15 | 42% (27–58%) | 21 | 0.75 |
| **ON** | 36 | 36 | **100%** (90–100%) | **0** | **0.00** |

**Held-out vs seen:**

| Split | OFF pass | PLACEBO pass | ON pass |
|---|---|---|---|
| Held-out (4 tasks × 3) | 3/12 (9 target violations) | 3/12 (9) | **12/12 (0)** |
| Seen (8 tasks × 3) | 11/24 (13) | 12/24 (12) | **24/24 (0)** |

**Per task** (passes out of 3; H = held-out):

| Task | OFF | PLACEBO | ON |
|---|---|---|---|
| logger-retry | 3 | 3 | 3 |
| logger-scheduler | 0 | 0 | 3 |
| tenancy-jsonl | 0 | 0 | 3 |
| tenancy-merge (H) | 0 | 0 | 3 |
| cents-bonus | 2 | 3 | 3 |
| cents-penalty (H) | 0 | 1 | 3 |
| migrations-default | 3 | 3 | 3 |
| migrations-timezone | 3 | 3 | 3 |
| pii-contact-audit (H) | 3 | 2 | 3 |
| pii-payout-fail | 0 | 0 | 3 |
| dates-csv | 0 | 0 | 3 |
| dates-link-expiry (H) | 0 | 0 | 3 |

**Significance.** Runs are clustered by task, so the main test is at the task level. ON beat OFF on 8 tasks, tied on 4
(both passed every run) and lost on none. The exact sign test gives **p = 0.0078**. The run-level Fisher exact test
on target violations (22/36 vs 0/36) gives p ≈ 4e-9. Read it as indicative only, because it treats clustered runs as
independent.

### Learning curve (`eval/curve.json`)

I added the lessons one at a time in the order they were learned. After each one, I re-ran the 6 "second" tasks (4
of them held-out), 1 run each, with the 6 distractors present at every step:

| Lessons in pack | Just added | Target violations (of 6) |
|---|---|---|
| 0 | — | 5 |
| 1 | use-logger | 3 |
| 2 | export-assert-single-customer | 2 |
| 3 | money-integer-cents | 1 |
| 4 | migrations-append-only | 1 |
| 5 | sec-no-pii-logs | 1 |
| 6 | dates-to-utc-iso | 0 |

Each lesson removes the violation it is about and nothing else. The last remaining violation (`dates-link-expiry`)
only disappears when the dates lesson arrives. Together with the placebo arm, this shows the effect comes from the
*content* of the learned lessons, not from extra context in general. The curve has n = 6 per point and 1 run, so it
is illustrative.

## Dashboard metrics (`GET /api/metrics`)

`/api/metrics` computes the learning dashboard from the database:
- **curve**: sessions from `pack_log` in time order, with corrections per session and markers where lessons were
  approved.
- **repeatMistakeRate**: the share of sessions with a correction about a lesson that was already approved.
- **acceptanceRate**: approved / (approved + rejected) over proposed lessons. Auto-blocked lessons count as rejected.
- **transfer**: a lesson first evidenced by person X, later served to person Y ≠ X in a session that touched the
  topic, with no correction on it.
- **eval** (+ `evalDetail`: n, placebo, held-out, CIs, curve): taken from `eval/results.json`.

> ⚠️ **The 14-day session history is synthetic.** `scripts/seed-history.mjs` generates 30 past sessions. They are
> marked `payload.synthetic = true` in `events` and use session ids `hist-*` in `pack_log`. The generator works like
> this: a topic gets a correction with p ≈ 0.75 until its lesson is approved, and p ≈ 0.07 afterwards (repeat
> mistakes). It also adds untopical one-off corrections that never become lessons, and uses a seeded PRNG. Lesson
> origins match the evidence on the seeded memories. Repeat rate, acceptance rate and transfers are then *computed*
> from those rows, not hard-coded. These numbers illustrate the dashboard; they are not measurements. Live sessions
> from the real hooks are appended to the same curve (`sources.syntheticSessions` reports the split). **The only
> measured result in this document is the eval above.**

Sample response (abridged snapshot at write-up time, 30 synthetic + 4 live sessions; live values move as real sessions arrive):

```json
{
  "curve": [{"session":1,"corrections":4}, {"session":4,"corrections":2,"lessonApproved":"migrations-append-only"}, "…"],
  "repeatMistakeRate": 0.118,
  "acceptanceRate": 0.765,
  "transfer": [{"lesson":"use-logger","from":"alex","to":"riley","at":"2026-10-14T18:20:00+00:00"}, "… 9 total"],
  "eval": {"tasks":12,"runs":3,"off":{"violationsPerTask":0.778,"passRate":0.389},"on":{"violationsPerTask":0,"passRate":1}},
  "sources": {"sessions":34,"syntheticSessions":30}
}
```

## Limitations (please read)

- **ON is a curated-retrieval ceiling.** The pack holds all six relevant lessons among six distractors. In production
  the pack is ranked by scope and confidence and capped by tokens (`src/lib/engine/pack.ts`), so a lesson can be
  missed. The eval measures *whether agents follow learned lessons once served*, not how good retrieval is. A
  `--pack server` mode (pulling `/api/context-pack`) exists but was not used for the headline numbers, because the
  seeded server pack does not control the held-out wording.
- **Held-out is narrow.** It holds out the *task and the wording*, not the *convention*. A held-out pass shows that a
  lesson generalises to a new situation. It does not show that Hivemind discovers conventions nobody corrected.
- **Small n, one model.** 12 tasks × 3 runs per arm, Sonnet 5.5 only, a single fixture, and tasks written by us.
  4 of the 12 tasks (`logger-retry`, both migrations tasks, `pii-contact-audit`) were already passed by OFF, so the
  discriminating set is effectively 8 tasks. The model already treats migrations as append-only.
- **Regex graders.** They were validated on 16 hand-written cases but can still miss things. Examples: PII written to a
  DB audit table rather than a log is not counted, and `assertSingleCustomer` inside a shared helper rather than the
  export file is counted as a violation.
- **Lessons were authored by us** in the form Hivemind's extractor produces. They were not extracted live by the
  engine during the eval.
- **The dashboard history is synthetic** (see above).

## Reproduce

```bash
node eval/check.selftest.mjs                       # grader self-test (16 cases)
node eval/run.mjs --mode main --runs 3             # 12 tasks × off,on,placebo × 3  (~15 min at concurrency 6)
node eval/run.mjs --mode curve --curve-runs 1      # learning curve (42 runs)
node eval/run.mjs --mode report                    # re-aggregate results.json / curve.json from eval/out
node scripts/seed-history.mjs                      # SYNTHETIC dashboard history (after scripts/seed.mjs)
```

The runner can resume: finished runs in `eval/out/<group>/<arm>/<task>__r<i>.json` are reused. It strips
`ANTHROPIC_API_KEY` from the child environment, so `claude -p` uses the Claude Code login.
