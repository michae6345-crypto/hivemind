---
name: hivemind
description: Hivemind team memory. Shows the team rules that apply right now (optionally for one file), teaches every agent on the team a new rule, or checks the Hivemind connection. Use when the user types /hivemind, asks which team rules or conventions apply, or wants a correction remembered for everyone.
argument-hint: "[rules [file] | teach <rule> | status]"
allowed-tools: mcp__hivemind__get_team_rules mcp__hivemind__propose_memory mcp__hivemind__search_memory Bash(node *) Bash(hivemind *)
---

# /hivemind

Arguments: `$ARGUMENTS`

Choose the subcommand from the first word of the arguments.

## No arguments, or `rules [file]`: show the rules that apply now

1. Call the `get_team_rules` tool on the `hivemind` MCP server. Pass `file` (repo-relative) if the user named one or you
   are about to edit a specific file.
2. If that MCP tool isn't available, run `{{HIVEMIND_CLI}} rules --agent claude-code`, adding `--file <path>` for one file.
3. Show the locked rules first, word for word, then the most relevant lessons and owners (as @handles). Never soften a
   locked rule. Keep it short, and use words, not emojis.

## `teach <rule>`: teach every agent on the team

1. The rule is everything after `teach`. If nothing follows `teach`, ask the user for the rule.
2. Call `propose_memory` with a short title (8 words or fewer) and the rule as the body. Scope it to this repo unless the
   user says it applies team-wide.
3. If that MCP tool isn't available, run `{{HIVEMIND_CLI}} teach "<rule>" --agent claude-code`.
4. Tell the user the lesson is pending until a human approves it, and name the approver as an @handle. Never call it
   active. If it came back blocked by a locked rule, name that rule.

## `status`: check the connection

Run `{{HIVEMIND_CLI}} status --agent claude-code` and summarise:

- Is the API reachable?
- How many rules are in the pack, and how many lessons are pending?
- Which agents are wired?

## Anything else

Print these usages: `/hivemind`, `/hivemind rules <file>`, `/hivemind teach <rule>`, `/hivemind status`.
