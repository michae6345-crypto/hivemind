# hivemind

**Correct one agent. Every agent learns.** Persistent memory across your team's AI agents, in your terminal.

- `hivemind init` connects every coding agent in a repo: Claude Code, Cursor, Gemini CLI, Copilot, Codex and Windsurf.
- `hivemind watch` shows the team's memory live.
- `hivemind check` and `hivemind teach` keep everyone's agents on the same rules.

It needs Node 20+ and has zero dependencies. It runs on Windows, macOS and Linux.

## Install

```bash
git clone <hivemind repo> && cd hivemind
npm i -g ./cli          # links `hivemind` onto your PATH (cmd, PowerShell and sh shims on Windows)
hivemind --version
```

`npm i -g ./cli` links to the checkout, so `git pull` updates the CLI, and the hook adapters in `hooks/` and the
templates in `integrations/` stay available. You can also run it without installing: `npx ./cli <command>`, or
`node cli/hivemind.mjs <command>`. The package layout is publish-ready (`npm pack` gives a 26 kB tarball), but a
published tarball has no `hooks/` or `integrations/`, so `init` falls back to MCP + rules files.

## 20-second quickstart

```bash
export HIVEMIND_TOKEN=<token> HIVEMIND_USER=<you>    # PowerShell: setx HIVEMIND_TOKEN <token>; setx HIVEMIND_USER <you>
cd your-repo
hivemind init                                        # --url <api> for a self-hosted or local server
hivemind                                             # opens hivemind watch on the right (Windows Terminal split)
```

`init` detects the agents your team uses from repo markers (`.claude/`, `.cursor/`, `.gemini/`, `.vscode/`,
`AGENTS.md`, `.windsurf/`) and from CLIs on your PATH. It wires each one, saves `.hivemind.json`, then runs `sync`. For
Claude Code it also adds the `/hivemind` skill and a `statusLine` (`hivemind statusline`), but only when you don't
already have one. To choose agents yourself, pass `--agents cursor,codex`.

All commands share the `hivemind watch` theme (`watch/theme.mjs`):

- rose: locked rules
- honey: team lessons
- `@handles` for people
- no emojis; `⬢ Hivemind · …` is the one glyph, as in the watch header

## Open the side pane: `hivemind`

Plain `hivemind`, with no command, opens `hivemind watch` next to your terminal, the same way typing `claude` opens Claude:

- In Windows Terminal, it splits the same window, with Hivemind on the right:
  `wt -w 0 split-pane -V --size 0.45 -d <cwd> --title Hivemind …`
- On other Windows terminals, it opens a new Windows Terminal window, or a PowerShell window if Windows Terminal isn't
  installed.
- On macOS, it splits the window in iTerm2, or opens a new Terminal.app window.
- On Linux, it runs `tmux split-window -h` inside tmux.

The pane gets the same cwd, repo and `HIVEMIND_USER` as the shell you ran it from, so it shows that session's hook
events. `hivemind` prints one line:

```text
⬢ Hivemind opened on the right · watching #repo/export-service as @kevin
```

Opening is instant. Nothing calls the API before the pane spawns, because the pane fetches its own data.

- `hivemind open --claude` also runs `claude` in the left pane, which sets up the whole demo layout in one command.
- `hivemind help` still prints help.

### From anywhere (home folder, `!hivemind`)

Every run inside a repo is remembered in `~/.hivemind/state.json`: the last 10 repos, with their repo id and user.
When `hivemind`, `open`, `watch`, `statusline`, `status` or `why` runs outside a repo, it picks one of those instead of
giving up:

1. Your default, if you've set one with `hivemind use <path>`.
2. Your recent repos. With exactly one, or without a TTY (e.g. `!hivemind` in Claude Code), it uses the most recent.
   With several and a TTY, it shows a numbered picker.
3. A quick search (about 1.5s) for `.hivemind.json` in `~/coding-projects`, `~/projects`, `~/code`, `~/src`,
   `~/Documents` (depth 5) and the current folder (depth 4). It skips `node_modules`, `.git`, `.next`, `AppData` and
   `.paseo`.

Either way it prints one line and carries on:

```text
⬢ Hivemind · not in a repo here — using #repo/playground (C:\…\hivemind\playground)
```

`hivemind use` lists recent repos, `hivemind use <path>` sets the default and `hivemind use --clear` clears it.

**Inside Claude Code**

- `!hivemind` is the instant path. Claude Code's `!` prefix runs the command directly, without a model turn. Inside
  Windows Terminal, plain `hivemind` opens the pane even though stdout isn't a TTY.
- `/hivemind` runs the same command through the skill: one Bash call, and Claude replies with that one line.
- `/hivemind rules`, `/hivemind teach <rule>` and `/hivemind status` do the rest.

**Troubleshooting**

- If the split lands in a different Windows Terminal window, set `HIVEMIND_OPEN_FOCUS=1`. That window was probably
  focused since you typed the command. With this setting, `hivemind` focuses its own window first, which costs one
  PowerShell start.
- `HIVEMIND_AUTOOPEN=1` makes `hivemind open --auto` open the pane once per Claude Code session. Add it as a
  SessionStart command hook (`{"type": "command", "command": "hivemind open --auto"}`); it prints nothing. Off by
  default.

## Commands

| Command | What it does |
|---|---|
| `init [--agents …] [--repo repo/<name>] [--user <id>] [--url <api>] [--dir <path>] [--hivemind-dir <path>] [--no-sync] [--no-vscode] [--copilot-cli] [--dry-run]` | Writes the MCP, hook and rules config for each agent, then syncs the rules files |
| `sync [--agents …] [--dry-run] [--personal --user <id>]` | Fetches `/api/context-pack` and writes it between `<!-- hivemind:start -->` / `<!-- hivemind:end -->` markers. Idempotent. Run it in CI or a cron to keep rules fresh |
| `status` | Pings the API, then shows the rules in the pack, pending lessons, and each agent's MCP, hooks and rules files |
| `teach "<rule>" [--scope repo/x|team/x]` | Sends the rule to `/api/events` as a correction, so it gets the same extract, merge and 🔒 checks as any other correction. Prints `Lesson proposed — waiting on @<owner>`, or `Blocked by a locked rule`. A `team/…` scope is sent as a proposal for that scope |
| `rules [--file path]` | Prints the rules that apply now. With `--file`, it prints that file's rules plus live edits, using MCP `get_team_rules`. Output is colored on a TTY and plain markdown when piped |
| `use [<path> | --clear]` | Sets the default repo for runs outside a repo, such as from your home folder or with `!hivemind` in Claude Code. With no argument, it lists the recent repos from `~/.hivemind/state.json` |
| `why [--last | <rule words> | <file>:<line>]` | The history behind one rule, in about 12 lines: who set or taught it and the quote, the evidence (PRs as clickable links), approvals, whether it's in every agent's session pack, how often it was reinforced, and what it blocked. `--last` (the default) picks your most recent block, or the most recent `hivemind check` flag. In Claude Code: `/hivemind why` |
| `check <file…>` / `check --staged` `[--fix] [--deep]` | Checks files against the team's rules via `POST /api/vscode/check`, the same regex + Haiku engine as the VS Code squiggles. Each violation prints as a code frame. Its header is a clickable `path#Lnn` link (OSC 8 → `permalink()` from `watch/git.mjs`, else `file://`; `NO_HYPERLINKS=1` turns it off), followed by 2 lines of context, the range underlined `~~~~` (rose for locked rules, honey for lessons), the rule, the owner's `@handle` and the quick fix as a diff. `--fix` applies the quick fixes (deduped, bottom-up) and re-checks. Exits 1 while a locked rule is broken, so `hivemind check --staged` works as a pre-commit hook |

Every command accepts `--agent <kind>`, which sets the `x-hm-agent` header. The default is `$HIVEMIND_AGENT`, else `cli`.

**Claude Code skill.** `init` also installs `.claude/skills/hivemind/SKILL.md`, which provides four commands:

- `/hivemind`: shows the rules that apply now, via MCP `get_team_rules`
- `/hivemind rules <file>`: shows the rules for one file
- `/hivemind teach <rule>`: proposes a rule, via MCP `propose_memory`
- `/hivemind status`: checks the connection

Each command falls back to this CLI when MCP isn't available.

Settings are resolved in this order: flags, then `HIVEMIND_API_URL` / `HIVEMIND_TOKEN` / `HIVEMIND_USER` /
`HIVEMIND_REPO`, then `.hivemind.json`. After that the URL defaults to production
(`https://hivemind-q17i.onrender.com`), and the token falls back to the hivemind checkout's `.env.local`. Every request sends
`Authorization: Bearer $HIVEMIND_TOKEN` and `x-hm-agent: <agent>`.

## `hivemind why`

```text
$ hivemind why --last
⬢ Hivemind · why · blocked "Mixing Lab A and Lab B data is fine in tests" 10m ago
LOCKED RULE · ● #org
Never mix data from different lab customers
Set by ● @greg · Head of Security · 7 Sep · Security policy v3
  "Customer isolation is a contract term with every lab. No exceptions, including test data."
  ╰ 17 Oct an agent applied the quick fix
In context every agent in ● #repo/playground at session start · seen today: Claude Code
Reinforced 30× · 2 evidence · always applies · blocked 2 proposals
  ╰ latest: "Mixing Lab A and Lab B data is fine in tests" from ● @emily 10m ago
Only ● @greg can change this rule · open in Hivemind
```

It uses existing read-only routes: `/api/memories` (the rule's evidence and blocked proposals), `/api/scopes` (people),
`/api/activity/live` (approvals, agents seen) and `/api/context-pack?log=0` (whether the rule is in the pack).
`why <file>:<line>` runs the deterministic check on that line. `hivemind check` remembers its most serious flag for
`why --last`.

## `hivemind check`

```text
$ cd demo/export-service && hivemind check demo/violations.ts
…
locked rule: Never log expert personal info
   ╭─[demo/violations.ts:15:41]
   │
13 │   const rows: Row[] = [...labA, ...labB];
14 │   console.log("exporting quarterly report", { quarter, rows: rows.length });
15 │   logger.info("report requested", { by: requestedBy.email });
   │                                         ~~~~~~~~~~~~~~~~~ Logs an expert's email.
16 │   return rows.map((r) => `${r.id},${r.lab_customer_id},${r.payout_cents}`).join("
");
17 │ }
   │
   ├─ owner  @maya · Security
   ╰─ fix    log the expert id instead
15 │ -   logger.info("report requested", { by: requestedBy.email });
15 │ +   logger.info("report requested", { by: requestedBy.id });

⬢ Hivemind · 2 locked rules broken · 1 lesson · run with --fix to apply 2 quick fixes
```

The house style is no emojis: color carries the meaning (rose = locked rule, honey = team lesson), and people
are `@handles`.

By default `check` prints only the API's deterministic detectors, so a file gives byte-identical output on every run:

- Lab A and Lab B rows mixed
- PII in logs
- float money
- `console.*`
- a missing `assertSingleCustomer`

`--deep` also waits for the Haiku pass.

`--fix` can't fix everything. The lab mixing stays flagged after the fixes, because it needs a human; the re-check names
`@maya`.

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
