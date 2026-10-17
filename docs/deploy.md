# Deploying Hivemind

Status (Sat Oct 17, ~4:00 AM PT): **production is on Render** at https://hivemind-q17i.onrender.com (service `srv-db9l4vu1egvs73fmc5dg`, workspace
`tea-d9mu9bbm8hqs73d5vcrg`). Every push to `main` auto-deploys, with no daily deploy cap.

History: the first production deploy was the **old Vercel deploy**, https://hivemind-beta-virid.vercel.app (Fri Oct 16,
~11:00 PM, Michael's Hobby account). It hit Vercel's daily deploy cap, so it is **old and frozen**: don't point anything
at it. Sections 1–4 below are the original Vercel notes. The env-var table applies to Render too.

## 0. Render (current production)

| Setting | Value |
|---|---|
| URL | https://hivemind-q17i.onrender.com |
| Plan / region | `starter` (no idle sleep, so no cold start blowing the 5 s hook timeout) / `oregon` (near Supabase us-west-1) |
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Start | `pnpm start` (`next start`, binds Render's `$PORT`) |
| Health check | `/api/metrics` |
| Env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, `HIVEMIND_TOKEN`, `HIVEMIND_API_URL=https://hivemind-q17i.onrender.com`, `NODE_VERSION=24`, `NEXT_TELEMETRY_DISABLED=1` |

`render.yaml` is the Blueprint with the same settings. The service was created with the Render REST API
(`POST /v1/services`, key in `~/.render-api-key`). Env vars are changed with
`PUT /v1/services/<id>/env-vars/<KEY>`, then a redeploy (`POST /v1/services/<id>/deploys`).

Read-only smoke checks (all 200): `/`, `/app`, `/app/results`, `/api/metrics`,
`/api/context-pack?repo=repo/playground&user=kevin&session=preview` (Bearer `HIVEMIND_TOKEN` + `x-hm-user`), and a
JSON-RPC `initialize` POST to `/api/mcp`. The hooks, CLI, MCP configs and demo/playground configs all default to the
Render URL. Override with `HIVEMIND_API_URL=http://localhost:3000` for a local server.

Serverless notes from section 4 that no longer apply on Render: `maxDuration` and the function region are ignored. It
is one long-running Node process, so `after()` work simply finishes in-process.

# Original Vercel notes (old deploy)
The Vercel project is on Michael's Hobby account, so only he can change its settings or env vars.

## 1. Environment variables

Set these in Vercel → Project → Settings → Environment Variables (Production + Preview). Copy the values from
`.env.local`. Never paste them into chat or commit them.

| Name | Used by | Secret? | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/db.ts` | no | `https://wzcxaokjmzamsjbczvxa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `src/lib/db.ts` (fallback key) | no | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | `src/lib/db.ts` | **yes**, server only | `sb_secret_…`. Only imported from `server-only` modules |
| `ANTHROPIC_API_KEY` | learning engine (`src/lib/engine/*`, read by `@anthropic-ai/sdk`) | **yes**, server only | Without it the engine falls back to heuristics |
| `HIVEMIND_TOKEN` | `src/lib/auth.ts`: bearer token for hooks/MCP | **yes** | Same value goes into each engineer's shell env for the Claude Code hooks |
| `HIVEMIND_API_URL` | scripts / hooks only (not read by the app) | no | Set it to the Vercel URL on engineers' machines after deploying |
| `NEXT_PUBLIC_HIVEMIND_API` | UI (`store.tsx`) | no | Leave **unset** on Vercel: the UI then calls its own origin |
| `NEXT_PUBLIC_USE_MOCKS` | UI | no | Leave unset (`true` forces seed data) |

With no env vars at all, the UI still renders on seed data, and `/api/metrics` still returns the eval results.

## 2. Deploy

**Option A, dashboard (no CLI login needed):**
1. Go to vercel.com/new and import `michae6345-crypto/hivemind`. Framework: Next.js (auto-detected). Leave the root
   directory as `/`.
2. Add the env vars above, then click Deploy. The install command is detected from `pnpm-lock.yaml`
   (`packageManager: pnpm@10.28.0`).

**Option B, CLI:**
```bash
npx vercel login                 # Michael, once (interactive)
npx vercel link                  # create/link the project → writes .vercel/ (gitignored)
# add env vars (prompts for the value; repeat per var, per environment)
npx vercel env add SUPABASE_SECRET_KEY production
npx vercel deploy                # preview URL
npx vercel deploy --prod         # production
```

## 3. After deploying

1. Smoke test against the URL:
   ```bash
   node scripts/smoke-hooks.mjs https://<app>.vercel.app
   node scripts/e2e-demo.mjs --base https://<app>.vercel.app
   ```
2. Point the agents at the deployment by setting `HIVEMIND_API_URL=https://<app>.vercel.app` in the shell that
   launches Claude Code (used by `hooks/session-start.mjs` and `.mcp.json`).
3. ⚠️ `demo/export-service/.claude/settings.json` hard-codes `http://localhost:3000` for the http hooks
   (UserPromptSubmit / PostToolUse / SessionEnd). For a deployed demo, either keep `pnpm dev` running locally (simplest
   for recording) or change those three URLs to the Vercel URL (owner: C).
4. Put the URL in Devpost and in `HIVEMIND_API_URL`.

## 4. Serverless checks (done)

| Concern | Status |
|---|---|
| `eval/results.json` / `eval/curve.json` | Statically `import`ed in `src/app/api/metrics/route.ts`, so they are bundled into the function. No fs read at runtime |
| `server-only` | `db.ts`, `auth.ts`, `queries.ts`, `engine/pack.ts`, `activity/record.ts` are all server-only, and the build proves no client component imports them |
| Secrets in the client bundle | Only `NEXT_PUBLIC_*` vars are referenced from UI code |
| `cacheComponents: true` | Route segment `export const dynamic` is **not allowed**. Use `await connection()` (as `/api/metrics` does) for request-time routes. All API routes currently build as `ƒ` (dynamic) |
| Long-running routes | Default Vercel function limit (Fluid compute) is 300 s. Hook routes call Haiku with short timeouts, and Claude Code's http hook timeouts are 5–10 s, so the engine must answer well inside that. If a route grows slow, add `export const maxDuration = 30` (allowed with cacheComponents) |
| `after()` | `/api/hooks/prompt` answers within ~4.6 s and finishes learning in `after()` (`maxDuration = 60`). Supported on Vercel; both build fine under `cacheComponents` |
| Node version | Local is Node 24. Vercel's default (22.x) is fine. Scripts in `scripts/` run locally, not on Vercel |
| Region | Supabase project region vs Vercel function region: pick the same region (Project → Settings → Functions) to keep hook latency low |
