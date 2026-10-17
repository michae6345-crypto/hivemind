# hivemind CLI

`hivemind init` connects every coding agent in a repo to Hivemind team memory. `hivemind sync` keeps rules files
fresh for agents that have no hooks. Node 20+, zero dependencies.

## 30-second quickstart

```bash
npm i -g ./cli                                       # from the hivemind checkout; or run node <hivemind>/cli/hivemind.mjs
export HIVEMIND_TOKEN=<token> HIVEMIND_USER=<you>    # PowerShell: setx HIVEMIND_TOKEN <token>; setx HIVEMIND_USER <you>
cd your-repo
hivemind init --url https://<hivemind-host>
git add -A && git commit -m "Connect coding agents to Hivemind"
hivemind status
```

`init` detects the agents your team uses from repo markers (`.claude/`, `.cursor/`, `.gemini/`, `.vscode/`,
`AGENTS.md`, `.windsurf/`) and from CLIs on your PATH. It wires each one, saves `.hivemind.json`, then runs `sync`.
To choose agents yourself, pass `--agents cursor,codex`.

## Commands

| Command | What it does |
|---|---|
| `init [--agents …] [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>] [--no-sync] [--no-vscode] [--dry-run]` | Writes the MCP and hook config for each agent, then syncs the rules files |
| `sync [--agents …] [--dry-run] [--personal --user <id>]` | Fetches `/api/context-pack` and writes it between `<!-- hivemind:start -->` / `<!-- hivemind:end -->` markers. Idempotent. Run it in CI or a cron to keep rules fresh |
| `status` | Pings the API and shows rules in the pack, pending lessons, and which agents are wired |

Settings are resolved in this order: flags, then `HIVEMIND_API_URL` / `HIVEMIND_TOKEN` / `HIVEMIND_USER` /
`HIVEMIND_REPO`, then `.hivemind.json`, then the hivemind checkout's `.env.local`. Every request sends
`Authorization: Bearer $HIVEMIND_TOKEN` and `x-hm-agent: <agent>`.

## What gets written

| Agent | `--agents` id | MCP / hooks config | Rules file (`sync`) |
|---|---|---|---|
| Claude Code | `claude-code` | `.mcp.json` + `.claude/settings.json` (SessionStart, UserPromptSubmit, PostToolUse, SessionEnd hooks) | none: the SessionStart hook injects the live pack |
| Cursor | `cursor` | `.cursor/mcp.json` (`${env:HIVEMIND_TOKEN}`) | `.cursor/rules/hivemind.mdc` (`alwaysApply: true`) |
| Gemini CLI | `gemini-cli` | `.gemini/settings.json` (`httpUrl`, `$HIVEMIND_TOKEN`) | `GEMINI.md` |
| GitHub Copilot | `copilot` | `.vscode/mcp.json` (`servers` + `${input:hivemind-token}` prompt) | `.github/copilot-instructions.md` |
| Codex CLI | `codex` | `.codex/config.toml` (`bearer_token_env_var`, used in trusted projects) | `AGENTS.md` |
| Windsurf | `windsurf` | `.windsurf/mcp_config.hivemind.example.json` (Windsurf MCP config is user-level only) | `.windsurf/rules/hivemind.md` (`trigger: always_on`) |
| Anything else | `other` | prints the MCP URL | `AGENTS.md` |

**Safety:**

- Existing files are never overwritten. JSON keys are merged, and an existing `hivemind` server entry is kept as-is.
  A file that isn't plain JSON (for example JSONC with comments) is left alone, and the snippet goes to
  `<name>.hivemind.example.json` instead.
- Text outside the markers is never touched.
- Synced files contain org, team and repo memory only. Personal lessons are included only with `--personal`.

## Formats: verified vs live-tested

All formats were checked against vendor docs on 2026-10-16:

- [Cursor MCP](https://cursor.com/docs/context/mcp) and [rules](https://cursor.com/docs/context/rules)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) and [GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- [VS Code MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) and [custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Codex MCP and config](https://learn.chatgpt.com/docs/config-file/config-reference) and [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Windsurf rules](https://docs.devin.ai/desktop/cascade/memories) and [MCP](https://docs.devin.ai/desktop/cascade/mcp)

Claude Code wiring is the live-tested `demo/export-service` pattern. The other tools' files were generated and
checked against the docs; they were not run inside each tool. Two points are not confirmed by the docs:

- whether Gemini CLI expands `$VAR` inside MCP `headers`
- the Windsurf user-level MCP path
