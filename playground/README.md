TESTING SANDBOX — safe to break. Don't ship code from here.

# playground (Meridian Data · payouts-service)

A fictional service where you can poke at Hivemind without touching the demo repo. It pays the experts who label data
for our lab customers (Lab A, Lab B). It claims labeling jobs from a queue, computes payouts and takes Stripe webhooks.

Hivemind scope: `#repo/playground` (parent `#team/data-pipelines`, owner `@ben`). Claude Code here gets the team's rules
at session start, corrections become lessons, and `hivemind` opens the live pane on the right.

## Start

```powershell
cd playground
$env:HIVEMIND_USER = "kevin"     # who you are in the demo cast: kevin, emily, ben (lead), greg (security)
claude                            # then type  !hivemind  to open the side pane
```

Do **not** set `HIVEMIND_REPO` globally. If it's unset, the hooks and MCP default to `repo/playground` here.
Set `HIVEMIND_TOKEN` in your environment once (`setx HIVEMIND_TOKEN <token from .env.local>`, then open a new terminal).
The correction and edit hooks are HTTP hooks and only see real environment variables; without it they get a 401 and
Hivemind never sees your corrections.

Then work through [TRY-THIS.md](TRY-THIS.md).

## Layout

| Path | What |
|---|---|
| `src/db.ts` | fake Postgres client; `db.forTenant(tenantId)` is the only way into tenant tables |
| `src/logger.ts` | structured logger (`trace_id`, `tenant_id`, `job_id`) and `hmacExpertId()` |
| `src/jobs.ts` | `claimJobs(n)` with `FOR UPDATE SKIP LOCKED` |
| `src/payouts.ts` | payout math in integer `amount_cents` |
| `src/webhooks.ts` | Stripe `payout.paid` handler, deduped on `event.id` |
| `src/labeler-client.ts` | `fetchWithRetry` (429/503, full jitter, max 5, `Retry-After`) |
| `src/exports.ts` | `presignExport()` (one key, `expiresIn` ≤ 900s) |
| `src/experts.ts` | payout emails to experts (PII lives here, never in logs) |
| `src/routes/tasks.ts` | route handler parsing with a `.strict()` zod schema |
| `scratch/legacy-report.ts` | **deliberately broken** file for `hivemind check` |
| `migrations/` | append-only SQL |

## Reset

```powershell
git checkout -- playground/ ; git clean -fd playground/
```
