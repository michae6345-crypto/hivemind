# Wiring Claude Code to Hivemind

What you get once it's wired up:

| Hook | Type | Endpoint | Effect |
|---|---|---|---|
| `SessionStart` (startup/clear/compact) | command | `hooks/session-start.mjs` → `GET /api/context-pack` | Team rules, ranked lessons, owners and live activity are injected into the session (≤ 6k chars) |
| `UserPromptSubmit` | http | `POST /api/hooks/prompt` | Corrections you give the agent become ⏳ pending lessons |
| `PostToolUse` (`Edit\|Write\|MultiEdit`) | http | `POST /api/hooks/tool` | ⚠️ warning if another session edited the same file in the last 10 min, plus 🔒/📌 rules that mention the file |
| `SessionEnd` | http | `POST /api/hooks/session-end` | Updates confidence for the lessons that were in this session's pack |
| MCP `hivemind` | http | `/api/mcp` | Tools `search_memory` and `propose_memory` (proposals are always pending) |

A ready-made example is in `demo/export-service/.claude/settings.json` and `demo/export-service/.mcp.json`.

## 1. Environment variables (Michael and Adrian each set these)

Hook commands and http hook headers read these from the environment Claude Code is launched from.

| Var | Michael | Adrian | Notes |
|---|---|---|---|
| `HIVEMIND_USER` | `michael` | `adrian` | Shown as "@michael's agent" in collision warnings and the live feed |
| `HIVEMIND_TOKEN` | from `.env.local` | from `.env.local` | Must match the server's `HIVEMIND_TOKEN` |
| `HIVEMIND_API_URL` | `http://localhost:3000` | `http://localhost:3000` | Later: the Vercel URL. Used by the SessionStart script and `.mcp.json` |
| `HIVEMIND_REPO` | optional | optional | Defaults to `repo/<folder name>`; set it if the folder name ≠ scope (e.g. `repo/export-service`) |

PowerShell (persists for new terminals):
```powershell
setx HIVEMIND_USER michael        # Adrian: adrian
setx HIVEMIND_TOKEN "<token from .env.local>"
setx HIVEMIND_API_URL http://localhost:3000
```
macOS/Linux (`~/.zshrc`):
```bash
export HIVEMIND_USER=adrian HIVEMIND_TOKEN='<token>' HIVEMIND_API_URL=http://localhost:3000
```
Open a new terminal after `setx`. The SessionStart script also falls back to the hivemind repo's `.env.local` for missing
`HIVEMIND_TOKEN`/`HIVEMIND_API_URL`, but the http hooks only see real environment variables.

## 2. Try it on the demo repo

```bash
pnpm dev                                   # hivemind server on :3000
cd demo/export-service
claude                                     # or: claude -p "Before doing anything, list the rules you must follow in this repo."
```
The first answer should list the 🔒 *Never mix data from different lab customers* rule. Ask the agent to edit
`src/export.ts` from two terminals with different `HIVEMIND_USER` values to see the ⚠️ collision warning.
In headless mode MCP tools need `--allowedTools mcp__hivemind__search_memory`.

## 3. Wire your own repo

Copy `demo/export-service/.claude/settings.json` into `<your repo>/.claude/settings.json` (or `~/.claude/settings.json`
for all repos) and change the SessionStart command to an **absolute** path to this checkout:

```json
{ "type": "command", "command": "node \"C:/Users/<you>/…/hivemind/hooks/session-start.mjs\"", "timeout": 15 }
```

On Windows, Claude Code runs command hooks in Git Bash (PowerShell if Git Bash is missing). Use forward slashes and
keep the quotes. Copy `demo/export-service/.mcp.json` next to it (or run
`claude mcp add --transport http hivemind "$HIVEMIND_API_URL/api/mcp" --header "Authorization: Bearer $HIVEMIND_TOKEN"`).

## 4. Point at Vercel later

1. In every `.claude/settings.json`, replace `http://localhost:3000` in the three http hook `url`s with the Vercel URL.
   Http hook URLs don't expand env vars, so they have to be hardcoded.
2. `setx HIVEMIND_API_URL https://<app>.vercel.app` (the SessionStart script and `.mcp.json` pick it up).
3. Make sure the Vercel project has the same `HIVEMIND_TOKEN` env var.
4. If you use the `allowedHttpHookUrls` setting, add the Vercel URL to it.

## Troubleshooting

- **No rules at session start:** run the hook by hand:
  `echo '{"session_id":"t","cwd":"'$PWD'"}' | node <hivemind>/hooks/session-start.mjs`.
  If it prints "Hivemind team memory unavailable…", the server is down or the URL is wrong. The hook always exits 0, so it never blocks a session.
- **Http hooks return 401:** `HIVEMIND_TOKEN` isn't in the environment Claude Code was launched from.
- **`HTTP 404` from `/api/hooks/prompt` or `/api/hooks/session-end`:** those routes haven't been deployed yet. `onFailure: "continue"` keeps the session running.
- **Smoke test:** `node scripts/smoke-hooks.mjs http://localhost:3000` (add `--propose` to also create a pending test lesson).
