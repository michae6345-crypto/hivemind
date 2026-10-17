# QA status (agent D)

_Last updated: Fri Oct 16, ~11:30 PM PT, on main incl. `cccd47f` (approve/reject) and `09e2156`._
Re-run after each big merge: `pnpm build` · `node scripts/e2e-demo.mjs` (server on :3104) · `node scripts/reset-demo.mjs --dry-run`

## Build

| Check | Status |
|---|---|
| `pnpm build` | ✅ passes (19 routes: website `/`, app `/app`, `/app/approvals`, `/app/results`, 14 API routes) |
| `pnpm typecheck` / `pnpm lint` | ✅ |
| Migrations | ✅ fixed the filename collision: `0002_people_title_rejection_event.sql` → `0003_…`. It was already applied, so this is a rename only. If anyone uses the Supabase CLI migration history, note the new prefix |
| Gotcha | If the build fails with `.next/dev/types/validator.ts … Cannot find module '../../../src/app/(ui)/approvals/page.js'`, stale dev-server types from before the `/app` move are the cause. Run `rm -rf .next/dev`. Vercel isn't affected |

## Demo beats: `node scripts/e2e-demo.mjs`

| Beat | Result | Evidence |
|---|---|---|
| (a) Sam corrects → **pending** lesson | ❌ **demo blocker**, see issue 1 | Hook says `✅ "Every export calls assertSingleCustomer()" is now confirmed by multiple engineers — active for every agent`. It skipped pending and auto-promoted |
| (b) engineer 403 → Jordan approves | ✅ | alex → `403 engineer alex cannot approve memories in repo/export-service`; jordan → `200 status=active`. Tested on a seeded pending lesson because (a) leaves none |
| (c) fresh `claude -p` as Noor gets the lesson, follows it | ✅ | Real SessionStart hook in a temp copy of `demo/export-service`. `pack_log` shows the lesson served (11 memories, 783 tokens), and the new `src/csv-export.ts` calls `assertSingleCustomer(rows)`. With a multi-lab task the agent refuses and cites the 🔒 rule |
| (d) "mixing labs is fine in tests" → blocked | ✅ | `🚫 Hivemind blocked "Mixing Lab A and Lab B data is fine in tests": conflicts with 🔒 Never mix data from different lab customers (Maya Chen)` |
| (e) Cursor + Claude Code, same file → collision | ✅ | `⚠️ @alex's Cursor agent edited export.ts just now — coordinate before changing it.` Live item has `agent=cursor` |

## Open issues

1. **Beat 0:15 never shows "waiting for approval".** Owner: **Michael decides**; fix in seed (**A**, `src/mocks/data.ts` is
   Adrian's file) or engine (**B**).
   - Default seed: `export-assert-single-customer` is already pending with evidence from alex. Sam's correction merges
     into it, which makes 2 distinct engineers, so it **auto-promotes to active** (`src/lib/engine/pipeline.ts:148`).
     The lead never approves.
   - Seed with that lesson dropped (`reset-demo.mjs --drop export-assert-single-customer`): the correction is merged
     into the locked rule `sec-lab-isolation` instead ("📝 reinforced an existing lesson"). That rule's seed body
     (`src/mocks/data.ts:60`) already says *"Every export must pass `assertSingleCustomer(rows)` before it writes."*
     This happens even with wording that never mentions labs.
   - **Recommended fix:** delete that sentence from the locked rule body (`src/mocks/data.ts:60`), then record after
     `node scripts/reset-demo.mjs --drop export-assert-single-customer`. Sam's correction should then create a fresh
     pending lesson. Alternative (B): a correction that matches a 🔒 rule still ADDs a specific pending lesson, and
     auto-promotion is disabled for the demo.
2. **`demo/export-service/.claude/settings.json` http hooks hard-code `localhost:3000`.** Owner: **C**. That's fine when
   recording against local `pnpm dev`. For the deployed URL, edit the 3 URLs (`docs/deploy.md` §3).
3. *(Watch)* One headless run earlier hung inside the SessionStart hook, and Claude Code's 15 s hook timeout didn't kill
   it on Windows. It hasn't reproduced since (the hook answers in ~1.7 s). `e2e-demo.mjs` now kills the process tree
   after 240 s.

## DB state

- Reset at ~11:30 PM: 22 seed memories, 30 synthetic sessions kept. Smoke/e2e/API-test/adapter leftovers are deleted.
  `reset-demo.mjs` now always removes `api-test-%` / `smoke-test-%` slugs, `Smoke test lesson…` / `API test:` titles,
  and events with `payload.slug` `api-test-%`.
- **Before recording:** `node scripts/reset-demo.mjs --dry-run`, then `node scripts/reset-demo.mjs` (add
  `--drop export-assert-single-customer` once issue 1's seed fix lands).

## Deploy

- Orchestrator is deploying. The env list and serverless notes are in `docs/deploy.md`. `/api/hooks/prompt` uses
  `after()` + `maxDuration = 60`; both build under `cacheComponents` and work on Vercel.
