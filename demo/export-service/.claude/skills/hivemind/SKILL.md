---
name: hivemind
description: Opens the Hivemind side pane (hivemind watch) to the right of this terminal. `/hivemind` with no arguments only opens the pane, it never prints rules. `/hivemind rules [file]` lists team rules, `/hivemind teach <rule>` teaches every agent, `/hivemind status` checks the connection. Fastest path, with no model turn at all, is `!hivemind`.
argument-hint: "[open | rules [file] | teach <rule> | status]"
allowed-tools: Bash(node *) Bash(hivemind *) mcp__hivemind__get_team_rules mcp__hivemind__propose_memory mcp__hivemind__search_memory
---

# /hivemind

Arguments: `$ARGUMENTS`

Choose the subcommand from the first word of the arguments.

## No arguments, or `open`: open the side pane (default)

Do not fetch or print rules. Do not call any MCP tool. Run exactly this one command and reply with its output line only:

```
node "../../cli/hivemind.mjs" open
```

The output is one line, `⬢ Hivemind opened on the right · watching #repo/<name> as @<user>`. Reply with that line and
nothing else: no summary, no follow-up question. If the command fails, reply with its error line only.

(The user can skip this turn entirely by typing `!hivemind`, Claude Code's `!` prefix runs it directly.)

## `rules [file]`: list the rules that apply. Only when explicitly asked

1. Call the `get_team_rules` tool on the `hivemind` MCP server. Pass `file` (repo-relative) if the user named one.
2. If that MCP tool isn't available, run `node "../../cli/hivemind.mjs" rules --agent claude-code`, adding `--file <path>` for one file.
3. Show the result in Hivemind's terminal style. No emojis, no tables, no bold-heavy markdown. Start with one line
   `Hivemind · {n} team rules for #{repo}` (or `… for {file}`). Then one block per rule, locked rules first, word for word.
   Never soften a locked rule:

   ```
   LOCKED RULE · #org
   Never mix data from different lab customers
   Set by @greg · Head of Security · locked 7 Sep

   TEAM LESSON · #repo/export-service
   Exports call assertSingleCustomer() before writing
   Learned from @emily's correction · 3h ago · approved by @ben
   ```

   Keep the label, title and provenance lines exactly as the tool returns them. End with owners as @handles.

## `teach <rule>`: teach every agent on the team

1. The rule is everything after `teach`. If nothing follows `teach`, ask the user for the rule.
2. Call `propose_memory` with a short title (8 words or fewer) and the rule as the body. Scope it to this repo unless the
   user says it applies team-wide.
3. If that MCP tool isn't available, run `node "../../cli/hivemind.mjs" teach "<rule>" --agent claude-code`.
4. Relay the tool's one line as is, e.g. `Hivemind · Lesson proposed for #{scope}: "{title}". Pending approval by @{lead}; not active until then.`
   Never call it active. If it came back blocked, relay the block line and name the locked rule.

## `status`: check the connection

Run `node "../../cli/hivemind.mjs" status --agent claude-code` and summarise in three plain lines, each starting with `Hivemind · `:
API reachable, rules in the pack and pending lessons, agents wired.

## Anything else

Print these usages: `/hivemind` (open the pane), `/hivemind rules <file>`, `/hivemind teach <rule>`, `/hivemind status`,
and the instant path `!hivemind`.
