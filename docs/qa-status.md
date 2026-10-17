# QA status (agent D)

_Last updated: Sat Oct 17, ~2:15 AM PT. Terminal pivot: `hivemind watch` is the hero (runbook: `docs/demo-terminal.md`)._
Re-run after each big merge: `pnpm typecheck` · `pnpm build` · `node cli/hivemind.mjs watch --help` · `node scripts/e2e-terminal.mjs` · `node scripts/e2e-demo.mjs --base https://hivemind-beta-virid.vercel.app` (then `reset-demo`)

## Build

| Check | Status |
|---|---|
| `pnpm build` | ✅ passes (19 routes: website `/`, app `/app`, `/app/approvals`, `/app/results`, 14 API routes) |
| `pnpm typecheck` / `pnpm lint` | ✅ |
| Prod deploy fail ~11:54 PM (`hivemind-4b4fizv9y`) | ✅ fixed. Root cause: a CLI deploy uploaded a working copy in which a demo session had edited `demo/export-service/src/export.ts` (logged `expert_email`). The root tsconfig typechecked `demo/`, so it failed with `TS2339: Property 'expert_email' does not exist on type 'Row'`. Committed `main` was fine. Fix: `demo` added to `tsconfig.json` `exclude` (ESLint already ignores it). The demo repo is a fictional target that agents edit live, and it must never gate the app build |
| Migrations | ✅ fixed the filename collision: `0002_people_title_rejection_event.sql` → `0003_…`. It was already applied, so this is a rename only. If anyone uses the Supabase CLI migration history, note the new prefix |
| Gotcha | If the build fails with `.next/dev/types/validator.ts … Cannot find module '../../../src/app/(ui)/approvals/page.js'`, stale dev-server types from before the `/app` move are the cause. Run `rm -rf .next/dev`. Vercel isn't affected |

## Terminal demo: `node scripts/e2e-terminal.mjs` (prod, 3/3 runs green, ~2 AM)

| Step | Result |
|---|---|
| 1 `watch --help` prints watch usage | ✅ |
| 2 Here view before the bad write: no violation on that file | ✅ |
| 4 `hivemind check` → `locked rule: Never log expert personal info`, `owner @greg · Security`, exit 1 | ✅ |
| 5 `watch --snapshot --file` after the write → `LOCKED RULE · Never log expert personal info` frame | ✅ |
| 6 real file watcher (`--snapshot --wait 5000`, file written 1.5 s in) → same frame | ✅ |

`e2e-demo` on the **new personas** (kevin corrects, ben approves, emily 403 + fresh session) against prod: (a) (b) (d) (e) ✅
in the full run and (c) ✅ re-run alone. In the full run, (c) failed with `claude -p exit=1` at the same moment a local
build OOMed, which points to machine memory pressure with 12 Claude sessions open. Watch it.

## Demo beats: `node scripts/e2e-demo.mjs --base https://hivemind-beta-virid.vercel.app` (PRODUCTION, ~12:15 AM, on `b6475d1`)

**5/5 PASS.**

| Beat | Result | Evidence |
|---|---|---|
| (a) Sam corrects → pending lesson | ✅ | `📝 Hivemind captured a lesson: "Every export calls assertSingleCustomer()" — pending approval by Jordan Reyes`. Status pending, team/data-pipelines |
| (b) engineer 403 → Jordan approves | ✅ | alex → `403 engineer alex cannot approve memories in team/data-pipelines`; jordan → `200 status=active` |
| (c) fresh `claude -p` as Noor follows it | ✅ | Real SessionStart hook. `pack_log` shows the lesson served (11 memories, 757 tokens), and `src/csv-export.ts` calls `assertSingleCustomer(rows)` |
| (d) "mixing labs is fine in tests" → blocked | ✅ | `🚫 Hivemind blocked … conflicts with 🔒 Never mix data from different lab customers (Maya Chen)` |
| (e) Cursor + Claude Code, same file → collision | ✅ | `⚠️ @alex's Cursor agent edited export.ts just now`. Live item has `agent=cursor` |

## Open issues

0. **Local `pnpm build` can OOM** (`FATAL ERROR … JavaScript heap out of memory`, exit 134) while many Claude sessions
   run on this machine. Re-running alone passes (23 pages). Vercel builds of main are green. Not a code issue.

1. ~~Beat 0:15 auto-promoted / merged into the 🔒 rule~~ → **fixed by B in `b6475d1`** (no auto-promotion, never merge
   into locked rules). It works with the default seed, so no `--drop` is needed.
2. ~~MCP permission prompt~~: C added `permissions.allow` to the demo settings. They apply only in a **trusted**
   workspace, so run `claude` once interactively in `demo/export-service` on the recording machine (see the runbook §0).

3. **`demo/export-service/.claude/settings.json` http hooks still say `localhost:3000`.** Owner: **C**. Fine when
   recording against local `pnpm dev`. Point them at production if recording against prod.
4. *(Watch)* One hung SessionStart hook earlier (Windows) hasn't reproduced. `e2e-demo.mjs` kills the tree after 240 s.

## DB state

- Reset after the prod e2e run. The dry run now shows 0 leftovers: 22 seed memories, 30 synthetic sessions /
  134 synthetic events. `reset-demo.mjs` also removes empty/`preview…` session pack_log rows, `api-test-%` /
  `smoke-test-%` memories and their events.
- **Before recording:** `node scripts/reset-demo.mjs --dry-run`, then `node scripts/reset-demo.mjs`. It's the same
  Supabase for local and prod.

## Deploy

- Production: https://hivemind-beta-virid.vercel.app (functions in sfo1). The env list and serverless notes are in `docs/deploy.md`. `/api/hooks/prompt` uses
  `after()` + `maxDuration = 60`; both build under `cacheComponents` and work on Vercel.
