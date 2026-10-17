# Hivemind for every coding agent

Hivemind's learning loop (briefing → correction capture → collision warnings → search/propose) works from Claude Code
natively, and from **Cursor, Gemini CLI, Codex CLI, GitHub Copilot and Windsurf** via thin hook adapters in
[`hooks/adapters/`](../hooks/adapters) plus the per-tool templates in this folder.

## Capability matrix

✅ native hook / native config · 🟡 via rules file + MCP (the agent has to choose to call the tool) · ❌ not possible

| Tool | Briefing at start | Correction capture | Edit / collision warning | Search + propose (MCP) |
|---|---|---|---|---|
| **Claude Code** (reference) | ✅ `SessionStart` → `additionalContext` | ✅ `UserPromptSubmit` http hook | ✅ `PostToolUse` http hook → `additionalContext` | ✅ `.mcp.json` |
| **Cursor** | ✅ [`sessionStart`](https://cursor.com/docs/hooks) → `additional_context` | ✅ [`beforeSubmitPrompt`](https://cursor.com/docs/hooks) (capture only, it can't inject) | ✅ records via [`afterFileEdit`](https://cursor.com/docs/hooks), so other agents get warned · 🟡 Cursor's own agent only sees the warning if it honours `additional_context` there (undocumented) | ✅ [`.cursor/mcp.json`](https://cursor.com/docs/context/mcp) `url` + `headers` with `${env:VAR}` |
| **Gemini CLI** | ✅ [`SessionStart`](https://geminicli.com/docs/hooks/) → `hookSpecificOutput.additionalContext` | ✅ [`BeforeAgent`](https://geminicli.com/docs/hooks/) | ✅ [`AfterTool`](https://geminicli.com/docs/hooks/) (`write_file\|replace`) → `additionalContext` + `systemMessage` | ✅ [`.gemini/settings.json`](https://geminicli.com/docs/tools/mcp-server/) `httpUrl` + `headers` with `$VAR` |
| **Codex CLI** | ✅ [`SessionStart`](https://developers.openai.com/codex/hooks) → `additionalContext` | ✅ [`UserPromptSubmit`](https://developers.openai.com/codex/hooks) | ✅ [`PostToolUse`](https://developers.openai.com/codex/hooks) (`apply_patch`; paths parsed from `*** Update File:` lines) → `additionalContext` + `systemMessage` | ✅ [`.codex/config.toml`](https://developers.openai.com/codex/mcp) `url` + `bearer_token_env_var` + `env_http_headers` |
| **GitHub Copilot** (VS Code agent mode) | ✅ [`SessionStart`](https://code.visualstudio.com/docs/copilot/customization/hooks) (Preview) → `hookSpecificOutput.additionalContext` | ✅ [`UserPromptSubmit`](https://code.visualstudio.com/docs/copilot/customization/hooks) | ✅ [`PostToolUse`](https://code.visualstudio.com/docs/copilot/customization/hooks) (edit tool names undocumented, so we match `/edit\|write\|create\|replace/`) | ✅ [`.vscode/mcp.json`](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration) `type: http` + `headers` with `${input:…}` |
| ↳ Copilot CLI / coding agent | ✅ [`sessionStart`](https://docs.github.com/en/copilot/reference/hooks-configuration) → `additionalContext` | ✅ `userPromptSubmitted` | ✅ `postToolUse` (`edit`/`create`) → `additionalContext` | ✅ (CLI's own MCP config) |
| **Windsurf** (Cascade) | 🟡 no session-start hook and hooks can't inject context, so it relies on the always-on [`.windsurf/rules/hivemind.md`](https://docs.windsurf.com/windsurf/cascade/memories) and `get_team_rules` | ✅ [`pre_user_prompt`](https://docs.windsurf.com/windsurf/cascade/hooks) (capture only) | ✅ [`post_write_code`](https://docs.windsurf.com/windsurf/cascade/hooks) records and prints the warning to the **user** (`show_output: true`), not the model | ✅ [`mcp_config.json`](https://docs.windsurf.com/windsurf/cascade/mcp) `serverUrl` + `headers` with `${env:VAR}` (user-level only) |

Every tool also gets a rules file telling the agent: *"Call the Hivemind `get_team_rules` MCP tool at the start of every
task; when the user corrects you, call `propose_memory`."* That is the 🟡 fallback wherever a hook is missing, and a
belt-and-braces second path where hooks exist.

**Caveats from the docs (Oct 2026)**
- **Gemini CLI** stopped serving consumer tiers on 2026-06-18. It still works with a paid `GEMINI_API_KEY`, Vertex or enterprise; Antigravity CLI is the successor and keeps the same hooks ([announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli)).
- **Cursor** cloud/background agents run command hooks only, with no `sessionStart` and no MCP hooks. Whether `cursor-agent` (CLI) fires these hooks isn't documented.
- **Codex** reads project `.codex/` config and hooks only in *trusted* projects, and new hooks need a one-time review in `/hooks`.
- **VS Code** hooks are Preview (`chat.useHooks`, on by default). VS Code has no session-end event, so confidence updates don't run from Copilot.
- **Windsurf** docs now redirect to docs.devin.ai (the product is now "Devin Desktop"). The workspace hooks file is `.devin/hooks.json`, with legacy `.windsurf/hooks.json` used when `.devin/` has none, and MCP config is user-level only.

## What each adapter does

`hooks/adapters/<tool>.mjs` (Node ≥ 18, no deps) reads the tool's hook JSON from stdin and maps it onto the same
endpoints Claude Code uses, translating the payload into the Claude-Code shape the routes already accept:

| Hivemind op | Endpoint | Cursor | Gemini CLI | Codex | Copilot (VS Code / CLI) | Windsurf |
|---|---|---|---|---|---|---|
| Briefing | `GET /api/context-pack` | `sessionStart` | `SessionStart` | `SessionStart` | `SessionStart` / `sessionStart` | (rules file) |
| Correction | `POST /api/hooks/prompt` | `beforeSubmitPrompt` | `BeforeAgent` | `UserPromptSubmit` | `UserPromptSubmit` / `userPromptSubmitted` | `pre_user_prompt` |
| Edit | `POST /api/hooks/tool` | `afterFileEdit` | `AfterTool` | `PostToolUse` | `PostToolUse` / `postToolUse` | `post_write_code` |
| Session end | `POST /api/hooks/session-end` | `sessionEnd` | `SessionEnd` | `SessionEnd` | — / `sessionEnd` | — |

Every request carries `Authorization: Bearer $HIVEMIND_TOKEN`, `x-hm-user`, `x-hm-repo` and
**`x-hm-agent: cursor | gemini-cli | codex | copilot | windsurf`**. On any error or timeout an adapter prints the tool's
no-op output (`{}`, `{"continue":true}`, or an "unavailable" briefing) and exits 0, so it never breaks the host session.
`HIVEMIND_DEBUG=1` prints errors to stderr.

Env (missing vars are read from the hivemind checkout's `.env.local`, same as `hooks/session-start.mjs`):
`HIVEMIND_API_URL`, `HIVEMIND_TOKEN`, `HIVEMIND_USER` (default `sam`), `HIVEMIND_REPO` (default `repo/<workspace folder>`).

## Templates (for `hivemind init`)

Copy each folder's contents into the target repo root (except Windsurf's `mcp_config.json`), replacing:

| Placeholder | Value |
|---|---|
| `{{HIVEMIND_DIR}}` | absolute path to the hivemind checkout, **forward slashes** (e.g. `C:/Users/me/hivemind`) |
| `{{HIVEMIND_API_URL}}` | `http://localhost:3000` or the Vercel URL |
| `{{HIVEMIND_REPO}}` | scope id, e.g. `repo/export-service` |

`HIVEMIND_TOKEN` / `HIVEMIND_USER` stay as env-var references (secret / per-person). VS Code prompts for them once via `inputs`.

| Tool | Files | Notes |
|---|---|---|
| Cursor | `.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/rules/hivemind.mdc` | project hooks run from the project root |
| Gemini CLI | `.gemini/settings.json` (MCP + hooks + `context.fileName`), `GEMINI.md` | merge into an existing settings.json |
| Codex | `.codex/config.toml` (MCP), `.codex/hooks.json`, `AGENTS.md` | needs a trusted project; append to an existing AGENTS.md |
| Copilot | `.vscode/mcp.json`, `.github/hooks/hivemind.json`, `.github/copilot-instructions.md` | `cli/hooks.json` is the Copilot **CLI** variant; install it as `.github/hooks/hivemind-cli.json` only if the team uses the CLI |
| Windsurf | `.windsurf/hooks.json`, `.windsurf/rules/hivemind.md` | `mcp_config.json` merges into the **user** file `~/.codeium/windsurf/mcp_config.json` |

`AGENTS.md` is also read by Cursor, Copilot and Windsurf, so one Hivemind stanza there covers every tool's rules fallback.

## Testing

`node scripts/smoke-adapters.mjs [baseUrl]` (default `http://localhost:3105`) pipes documented sample payloads through every
adapter against a running server. See the script header for what it asserts.
