---
name: hivemind
description: Opens the Hivemind side pane (hivemind watch) to the right of this terminal. `/hivemind` with no arguments only opens the pane, it never prints rules. `/hivemind rules [file]` lists team rules, `/hivemind teach <rule>` teaches every agent, `/hivemind why [rule]` explains the history behind a block, `/hivemind status` checks the connection, `/hivemind update` updates the CLI. Fastest path, with no model turn at all, is `!hivemind`.
argument-hint: "[open | rules [file] | teach <rule> | why [rule] | status | update]"
allowed-tools: Bash(node *) Bash(hivemind *) PowerShell(node *) PowerShell(hivemind *) mcp__hivemind__get_team_rules mcp__hivemind__propose_memory mcp__hivemind__search_memory
---

# /hivemind

Arguments: `$ARGUMENTS`

Choose the subcommand from the first word of the arguments.

## No arguments, or `open`: open the side pane (default)

Do not fetch or print rules. Do not call any MCP tool. Run exactly this one command with the Bash tool (one call) and
reply with its output line only:

```
node "../cli/hivemind.mjs" open
```

The output is one line, `⬢ Hivemind is watching → @<user> on <name>` (on a narrow pane just `⬢ Hivemind is watching →`). Reply with the output and
nothing else: no summary, no follow-up question. If the command fails, reply with its error line only.

(The user can skip this turn entirely by typing `!hivemind`, Claude Code's `!` prefix runs it directly.)

This works from any folder. Outside a repo, `hivemind open` uses the default repo (`hivemind use <path>`) or the most
recent one, and prints `⬢ Hivemind · not in a repo here — using #repo/<name> (<path>)` before the opened line. Reply with
both lines as printed. If it says "Not in a Hivemind repo", reply with that line only.

## `rules [file]`: list the rules that apply. Only when explicitly asked

1. Call the `get_team_rules` tool on the `hivemind` MCP server. Pass `file` (repo-relative) if the user named one.
2. If that MCP tool isn't available, run `node "../cli/hivemind.mjs" rules --agent claude-code`, adding `--file <path>` for one file.
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
3. If that MCP tool isn't available, run `node "../cli/hivemind.mjs" teach "<rule>" --agent claude-code`.
4. Relay the tool's one line as is, e.g. `Hivemind · Lesson proposed for #{scope}: "{title}". Pending approval by @{lead}; not active until then.`
   Never call it active. If it came back blocked, relay the block line and name the locked rule.

## `status`: check the connection

Run `node "../cli/hivemind.mjs" status --agent claude-code` and summarise in three plain lines, each starting with `Hivemind · `:
API reachable, rules in the pack and pending lessons, agents wired.

## `why [rule]`: the history behind a block or flag

Run exactly one command and print its output verbatim, with no extra prose before or after it:

- no argument, or `last`: `node "../cli/hivemind.mjs" why --last --agent claude-code` (the most recent block or flag for this user)
- a rule name, slug or `file:line`: `node "../cli/hivemind.mjs" why "<argument>" --agent claude-code`

The output is about 12 lines: who set or taught the rule and why (quote, PR or incident), who approved it, which agents
have it in context, how often it was reinforced, and what it blocked. Don't summarise it, reformat it or add advice.

## `update`: update the Hivemind CLI now

Run exactly this one command with the Bash tool (one call) and print its output verbatim, with no extra prose:

```
node "../cli/hivemind.mjs" update
```

It prints `⬢ Hivemind · up to date (<sha>)`, or the commits it just pulled in. (The CLI also updates itself every 15
minutes in the background; `HIVEMIND_NO_UPDATE=1` turns that off.)

## When a team rule blocks a request

When a team rule stops a request, reply with exactly these 4 short lines and nothing else (no lists, no essay, don't restate the rule; plain text, no emojis, keep each line under 80 characters):
⬢ Hivemind · Blocked · LOCKED RULE "<rule title>" · @<owner>   (TEAM RULE if it isn't locked)
<one sentence: why it applies to this request>
<line 3: judge the user's underlying goal, not the method they named. Goal legitimate, rule only in the way ("log the email so I can trace failed payouts" → the goal is tracing payouts): Instead: <one-sentence compliant approach>, plus at most one short code line. Goal is the forbidden thing itself (mix Lab A and Lab B data, get around the rule, skip the tenant filter): @<owner> can change this rule. — and no workaround of any kind.>
Run /hivemind why for the history.

## Anything else

Print these usages: `/hivemind` (open the pane), `/hivemind rules <file>`, `/hivemind teach <rule>`, `/hivemind why [rule]`,
`/hivemind status`, `/hivemind update`,
and the instant path `!hivemind`.
