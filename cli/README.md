# hivemind CLI

`hivemind init` connects every coding agent in a repo to Hivemind team memory. `hivemind sync` keeps rules files
fresh for agents that have no hooks. Node 20+, zero dependencies.

## 30-second quickstart

```bash
npm i -g ./cli                                       # from the hivemind checkout; or run node <hivemind>/cli/hivemind.mjs
export HIVEMIND_TOKEN=<token> HIVEMIND_USER=<you>    # PowerShell: setx HIVEMIND_TOKEN <token>; setx HIVEMIND_USER <you>
cd your-repo
hivemind init                                        # --url <api> for a self-hosted or local server
git add -A && git commit -m "Connect coding agents to Hivemind"
hivemind status
```

`init` detects the agents your team uses from repo markers (`.claude/`, `.cursor/`, `.gemini/`, `.vscode/`,
`AGENTS.md`, `.windsurf/`) and from CLIs on your PATH. It wires each one, saves `.hivemind.json`, then runs `sync`.
To choose agents yourself, pass `--agents cursor,codex`.

## Commands

| Command | What it does |
|---|---|
| `init [--agents …] [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>] [--hivemind-dir <path>] [--no-sync] [--no-vscode] [--copilot-cli] [--dry-run]` | Writes the MCP, hook and rules config for each agent, then syncs the rules files |
| `sync [--agents …] [--dry-run] [--personal --user <id>]` | Fetches `/api/context-pack` and writes it between `<!-- hivemind:start -->` / `<!-- hivemind:end -->` markers. Idempotent. Run it in CI or a cron to keep rules fresh |
| `status` | Pings the API, then shows the rules in the pack, pending lessons, and each agent's MCP, hooks and rules files |
| `teach "<rule>" [--scope repo/x|team/x]` | Sends the rule to `/api/events` as a correction, so it gets the same extract, merge and 🔒 checks as any other correction. Prints `Lesson proposed — waiting on @<owner>`, or `Blocked by a locked rule`. A `team/…` scope is sent as a proposal for that scope |
| `rules [--file path]` | Prints the rules that apply now. With `--file`, it prints that file's rules plus live edits, using MCP `get_team_rules`. Output is colored on a TTY and plain markdown when piped |
| `check <file…>` / `check --staged` `[--fix]` | Checks files against the team's rules via `POST /api/vscode/check`, the same regex + Haiku engine as the VS Code squiggles. Each violation prints as a code frame: `file:line:col`, 2 lines of context, the range underlined `~~~~` (rose for locked rules, blue for lessons), the rule, the owner's `@handle` and the quick fix as a diff. `--fix` applies the quick fixes (deduped, bottom-up) and re-checks. Exits 1 while a locked rule is broken, so `hivemind check --staged` works as a pre-commit hook |

Every command accepts `--agent <kind>`, which sets the `x-hm-agent` header. The default is `$HIVEMIND_AGENT`, else `cli`.

**Claude Code skill.** `init` also installs `.claude/skills/hivemind/SKILL.md`, which provides four commands:

- `/hivemind`: shows the rules that apply now, via MCP `get_team_rules`
- `/hivemind rules <file>`: shows the rules for one file
- `/hivemind teach <rule>`: proposes a rule, via MCP `propose_memory`
- `/hivemind status`: checks the connection

Each command falls back to this CLI when MCP isn't available.

Settings are resolved in this order: flags, then `HIVEMIND_API_URL` / `HIVEMIND_TOKEN` / `HIVEMIND_USER` /
`HIVEMIND_REPO`, then `.hivemind.json`. After that the URL defaults to production
(`https://hivemind-beta-virid.vercel.app`), and the token falls back to the hivemind checkout's `.env.local`. Every request sends
`Authorization: Bearer $HIVEMIND_TOKEN` and `x-hm-agent: <agent>`.

## `hivemind check`

```text
$ cd demo/export-service && hivemind check demo/violations.ts
locked rule: Never log expert personal info
   ╭─[demo/violations.ts:15:3]
   │
13 │   const rows: Row[] = [...labA, ...labB];
14 │   console.log("exporting quarterly report", { quarter, rows: rows.length });
15 │   logger.info("report requested", { by: requestedBy.email });
   │   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ breaks a locked rule
16 │   return rows.map((r) => `${r.id},${r.lab_customer_id},${r.payout_cents}`).join("
");
17 │ }
   │
   ├─ owner  @maya · Head of Security
   ╰─ fix    log the expert's id, not their contact details
15 │ -   logger.info("report requested", { by: requestedBy.email });
15 │ +   logger.info("report requested", { by: requestedBy.id });
…
Hivemind · 3 locked rules broken · 1 lesson · run with --fix to apply 3 quick fixes
```

The house style is no emojis: color carries the meaning (rose = locked rule, blue #4C6EF5 = team lesson), and owners
are `@handles`. The regex pass is deterministic, so the fixture gives the same frames on every run:

- It catches a missing `assertSingleCustomer` in an export function.
- It catches rows from two lab customers being combined.
- It catches `console.*`.
- It catches an expert's email or phone in a log call.

LLM hits for a rule the regex pass already flagged are dropped.

`--fix` can't fix everything. Combining Lab A and Lab B rows stays flagged after the fixes, because that needs a human; the
re-check names `@maya`.

Pre-commit hook: `printf '#!/bin/sh
hivemind check --staged
' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.

## What gets written

`init` renders agent F's templates from [`integrations/<tool>/`](../integrations) (see that README for the capability
matrix). Hook commands run `node <hivemind>/hooks/adapters/<tool>.mjs`, so they need a hivemind checkout on the machine.
Pass `--hivemind-dir ../..` to write a relative path, which the demo repo uses. If `integrations/` is missing, `init`
falls back to built-in MCP-only writers.

| Agent | `--agents` id | MCP | Hooks | Rules file (`sync`) |
|---|---|---|---|---|
| Claude Code | `claude-code` | `.mcp.json` | `.claude/settings.json` | none: the SessionStart hook injects the live pack |
| Cursor | `cursor` | `.cursor/mcp.json` (`${env:HIVEMIND_TOKEN}`) | `.cursor/hooks.json` | `.cursor/rules/hivemind.mdc` (`alwaysApply: true`) |
| Gemini CLI | `gemini-cli` | `.gemini/settings.json` (`httpUrl`) | same file, `hooks` key | `GEMINI.md` |
| GitHub Copilot | `copilot` | `.vscode/mcp.json` (`${input:hivemind-token}` prompt) | `.github/hooks/hivemind.json`; with `--copilot-cli`, also `hivemind-cli.json` | `.github/copilot-instructions.md` |
| Codex CLI | `codex` | `.codex/config.toml` (trusted projects only) | `.codex/hooks.json` (approve once in `/hooks`) | `AGENTS.md` |
| Windsurf | `windsurf` | user-level only: `.windsurf/mcp_config.hivemind.example.json` | `.windsurf/hooks.json` | `.windsurf/rules/hivemind.md` (`trigger: always_on`) |
| Anything else | `other` | prints the MCP URL | none | `AGENTS.md` |

**Safety:**

- Existing files are never overwritten.
- JSON is deep-merged. Your keys and values win, Hivemind hook entries are appended to your hook arrays, and an event that
  already runs a Hivemind adapter is left alone.
- TOML gets a `[mcp_servers.hivemind]` table appended once.
  A file that isn't plain JSON (for example JSONC with comments) is left alone, and the snippet goes to
  `<name>.hivemind.example.json` instead.
- In rules files, text outside the markers is never touched, and the file's line endings (LF or CRLF) are preserved.
- Synced files contain org, team and repo memory only. Personal lessons are included only with `--personal`.

## Formats: verified vs live-tested

All formats were checked against vendor docs on 2026-10-16:

- [Cursor MCP](https://cursor.com/docs/context/mcp) and [rules](https://cursor.com/docs/context/rules)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) and [GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- [VS Code MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) and [custom instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Codex MCP and config](https://learn.chatgpt.com/docs/config-file/config-reference) and [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Windsurf rules](https://docs.devin.ai/desktop/cascade/memories) and [MCP](https://docs.devin.ai/desktop/cascade/mcp)

What was live-tested against a local server:

- Claude Code wiring, which is the `demo/export-service` pattern.
- The generated Cursor, Gemini and Codex `SessionStart` hook commands, run by hand with sample stdin. Each returned the
  pack.
- `init`, `sync` and `status`, including re-runs being no-ops.

None of the tools themselves were launched. These points are not confirmed by the docs:

- whether Gemini CLI expands `$VAR` inside MCP `headers`
- the Windsurf user-level MCP path
- whether Gemini, Codex and Copilot run project hooks from the repo root, which the relative `--hivemind-dir` relies on
  (Cursor documents that it does)
