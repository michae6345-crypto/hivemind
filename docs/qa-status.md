# QA status (agent D)

_Last updated: Sat Oct 17, ~12:20 AM PT, on main `1c92141`._
Re-run after each big merge: `pnpm build` · `node scripts/e2e-demo.mjs` (server on :3104) · `node scripts/reset-demo.mjs --dry-run`

## Build

| Check | Status |
|---|---|
| `pnpm build` | ✅ passes (19 routes: website `/`, app `/app`, `/app/approvals`, `/app/results`, 14 API routes) |
| `pnpm typecheck` / `pnpm lint` | ✅ |
| Prod deploy fail ~11:54 PM (`hivemind-4b4fizv9y`) | ✅ fixed. Root cause: a CLI deploy uploaded a working copy in which a demo session had edited `demo/export-service/src/export.ts` (logged `expert_email`). The root tsconfig typechecked `demo/`, so it failed with `TS2339: Property 'expert_email' does not exist on type 'Row'`. Committed `main` was fine. Fix: `demo` added to `tsconfig.json` `exclude` (ESLint already ignores it). The demo repo is a fictional target that agents edit live, and it must never gate the app build |
| Migrations | ✅ fixed the filename collision: `0002_people_title_rejection_event.sql` → `0003_…`. It was already applied, so this is a rename only. If anyone uses the Supabase CLI migration history, note the new prefix |
| Gotcha | If the build fails with `.next/dev/types/validator.ts … Cannot find module '../../../src/app/(ui)/approvals/page.js'`, stale dev-server types from before the `/app` move are the cause. Run `rm -rf .next/dev`. Vercel isn't affected |

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

1. ~~Beat 0:15 auto-promoted / merged into the 🔒 rule~~ → **fixed by B in `b6475d1`** (no auto-promotion, never merge
   into locked rules). It works with the default seed, so no `--drop` is needed.
2. **MCP permission prompt during the demo.** Owner: **C**. In (c), the agent tried `get_team_rules` (Hivemind MCP) and
   was denied for lack of permission. That's harmless headless (the pack already carried the lesson), but in an
   interactive recording it shows up as a permission prompt. Fix: add
   `"permissions": { "allow": ["mcp__hivemind__*"] }` to `demo/export-service/.claude/settings.json`.
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
