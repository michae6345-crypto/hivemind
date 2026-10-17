# QA2: end-to-end flow and latency

Measured Sat Oct 17, about 2:00 to 2:40 AM PT, from Michael's Windows machine. Scripts:

- `node scripts/qa-latency.mjs [--base …] [--n 6] [--md]` times the hooks, API routes, `statusline` and `open --dry-run`.
- `node scripts/qa-flow-timing.mjs [--base …] [--runs 3] [--skip-approve]` uses the real `startWatcher()` on a temp copy
  of `playground/`, timing write → flag and approve → celebration. Its probe lesson is rejected at the end.

**Before** = prod at `56ca6e1`. **After** = the fixes below, run on a local `pnpm dev` that talks to the same prod
Supabase. Prod got these fixes at `4e246dc`. Re-run `qa-latency.mjs` against prod to confirm them there.

## Latency (ms; p50 of 6 warm calls, first call in brackets)

| Path | Target | Before | After | Notes |
|---|---|---|---|---|
| SessionStart hook, total (`node hooks/session-start.mjs`) | < 1500 | 222 (525) | unchanged | `/api/context-pack` alone is 204 (554) |
| `POST /api/hooks/prompt`, task request | < 5000 | 1233 (2237) | **47** | no LLM call for plain task prompts |
| `POST /api/hooks/prompt`, correction | < 5000 | ~3000–4000 (engine.md) | unchanged | still the LLM path; `e2e-demo` (a) and (d) pass |
| `POST /api/hooks/tool` | — | 189 (242) | 152 local | 4 sequential DB round trips → 1 parallel round |
| `POST /api/vscode/check`, new text | — | ~1050 | **78** with `fast` | the old path waited up to 1s for Haiku |
| Agent writes a file → locked flag in watch | < 1000 | 520–580 | **263–273** | debounce 500 → 250 ms, local detectors |
| Agent writes a file → "This file follows every team rule" | < 1000 | 1400–1600 | **488–593** | waits for the server check, now `fast` |
| Agent writes a file → server confirms the flag | — | 1570–1710 | 420–680 | |
| Ben approves → celebration on Kevin's pane | — | 595 (approve 282) | unchanged | bounded by the 2s live poll: worst case ≈ 2.3s |
| `hivemind statusline` | Claude debounces at 300 | 153 node (346 first); ~410 via Git Bash | unchanged | 10s cache plus a detached refresh |
| `hivemind open --dry-run` | instant | 107 (87–151) | unchanged | no API call before the pane spawns |
| `/api/activity/live` · `/api/memories` · `/api/vscode/rules` | — | 82 · 103 · 70 | unchanged | watch polls these |

**Vercel cold vs warm.** The region is `sfo1`. The first call in each series (bracketed) runs 300–1000 ms slower than
warm calls. A true cold start wasn't isolated, because other agents keep prod warm. Even the worst first call (prompt hook, 2.2s)
stays under the 5s hook timeout. No warm-up ping was added.

## Fixes (pushed to main)

- `25b0a79` **perf(watch):** `POST /api/vscode/check` accepts `{ fast: true }` and returns detector hits at once
  (not cached, so a later full check still runs Haiku). `hivemind watch`, `statusline` and `check` without `--deep` send
  it, since they drop LLM hits anyway. Watcher debounce changed from 500 to 250 ms. Owners: H (route) and J (watcher).
- `26cf4cf` **perf(hooks/prompt):** `mayTeach()` in `extract.ts` skips the pipeline only when a prompt opens like a task
  ("Add …", "In src/x.ts, …", "When …") **and** has none of a broad set of cue words. Every documented correction, the bad
  lesson, and declarative facts ("Money is stored in cents") still go to the LLM. Those events were deleted after the LLM
  call anyway (`dropIfNotCorrection`), so no stored data changes. Owner: B.
- `4e246dc` **perf(hooks/tool):** `recordActivity` runs the prior-edits select, our insert and the file's rules in parallel.
  It excludes its own row by id, so first-touch rule lines and collisions behave the same. Checked: first touch → locked
  rule line; same session again → `{}`; another session → heads up plus the rule line. Owner: C.

## Flow checks run

- `node scripts/e2e-demo.mjs --base <prod>`: **5/5 PASS**. Correction → pending, 403 for an engineer and 200 for ben, a
  fresh `claude -p` session follows Kevin's lesson, the bad lesson is blocked by Greg's locked rule, and the Cursor + Claude
  Code collision fires.
- `node scripts/e2e-terminal.mjs`: **5/5 PASS** before and after the rebase.
- Counts: banner `Loaded 18 team rules for #repo/playground`, watch `Rules 18`, statusline `18 rules`. They agree; an
  earlier `20` in the statusline came from a reset running in between.
- `hivemind open --dry-run` from `playground`, `playground/src` and `demo/export-service`, in both Git Bash and
  PowerShell: the right Windows `-d` path (`playground/src` → `playground`), `--repo repo/playground` or
  `repo/export-service`, and `--user kevin`. With `HIVEMIND_USER` unset, the user falls back to `michae6345`.
- The global `hivemind` shim links to the main checkout's `cli/`, which has G's open fix (`0a88e7d`).

## Not done (the machine was overloaded)

- The `/hivemind` one-Bash-call check (`claude -p` with a stub CLI). The first try exited 127 before running.
- The 8 TRY-THIS exercises and runbook beats 4–8 one by one, permalink checks, and failure modes (API down, 401, slow
  Supabase, no Anthropic key).
- Re-measuring prod after the deploy, and the final `reset-demo` (the e2e-demo run wrote rows: run
  `node scripts/reset-demo.mjs` before recording).

## Open issues

- **Pull the main checkout before recording.** The right pane runs the CLI from there, and the watch speedups are CLI-side.
- `POST /api/events` has no token check, unlike the hook routes.
- `pnpm lint` has 1 pre-existing error, in `src/app/(ui)/opengraph-image.tsx:46` (unescaped `'`).
- Approve → celebration rides the 2s live poll. A poll right after an approve in the same pane would make it instant.
