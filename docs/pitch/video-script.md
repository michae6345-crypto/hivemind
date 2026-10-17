# Hivemind: 2:00 video script (terminal version)

Hard limit 2:00. Voiceover (VO) averages under 2 words per second against a calm read of about 2.3, so each beat fits
its slot with a breath to spare. Total VO: 224 words.

**Follow `docs/demo-terminal.md` (D's runbook) for setup, commands and fixes.** This script adds the timing, the VO
and the shots around it, and uses the same cast, prompts and beat order. If the two disagree on what to type, the
runbook wins; tell P so this file gets fixed. `src/components/site/demo-script.ts` must tell the same story.

**Cast** (seed `b4b0a20`, Meridian Data, fictional):

| Persona | `HIVEMIND_USER` | Role | Beats |
|---|---|---|---|
| Kevin Park | `kevin` | Engineer, Data Pipelines | 2 (corrects the agent) |
| Ben Carter | `ben` | Lead, owns `#team/data-pipelines` and `#repo/export-service` | 3 (approves) |
| Emily Ross | `emily` | Engineer, Data Pipelines | 3 (gets the 403), 4, 5, 6 (fresh session, blocked lesson, hero) |
| Greg Walsh | `greg` | Head of Security, owns the locked rules | named in beats 5 and 6 |

**The product surface is the terminal.** Claude Code on the left, `hivemind watch` in a split pane on the right,
Claude Code's status line along the bottom. Both panes use Adrian's website Terminal palette: no emoji, ⬢ is the only
mark. The web app appears only for the 403 (beat 3, two seconds) and Results (beat 8).

**Two lines every judge must hear (Adrian):** the Greptile contrast (review bots catch mistakes *after* the code is
written, Hivemind teaches the agent *before*), and that it's cheap to run (one command, under 1,000 tokens a session,
no model on the hot path). Both are in beat 9. Cut anything else first.

**The rule for backups:** a backup is for a feature that works but had a bad take. If a feature isn't on `main` at
recording time, don't show the website's Terminal animation as if it were the app. Cut the beat, or caption the mock
**"Design mockup, in progress"**. The runbook marks the views it hasn't asserted yet with **(confirm)**; eyeball those
in the rehearsal.

## Setup

Do runbook §0–§2 (one-time setup, `reset-demo` before every take, the `wt` split command). On top of that:
- 1920×1080, font 16+, `--no-motion` only if the celebration stutters. Browser zoom 125%.
- `npm i -g ./cli` from the hivemind checkout so `hivemind` is on PATH for beat 7.
- **Init shot:** an empty scratch repo containing `.claude/`, `.cursor/`, `.gemini/`, `.vscode/`, `.windsurf/` and an
  `AGENTS.md`, so `init` detects all six agents.
- Record each beat as its own clip with a 1 s handle on both ends. Switch persona between clips as the runbook says
  (`/exit`, set `HIVEMIND_USER` in both panes, restart both).

## Shot list

The **hero shot** is beat 6: on the right, the Here tab catches a locked-rule violation as a code frame, owned by
@greg. On the left, Claude Code either wrote the line or refused and cited Greg's rule; both are good takes. Use a
still of it as the thumbnail, the cold open and slide 3.

| # | Time | Window | On screen (exact actions) | VO | Words |
|---|---|---|---|---|---|
| 1 | 0:00–0:09 | Hero still, then title | Freeze-frame of beat 6's split terminal. Fade the two-tone headline over it: "Correct one agent. / Every agent learns." | "Your reviewer tells your AI agent what they told a teammate's agent last week. Every session starts from zero." | 19 |
| 2 | 0:09–0:25 | Split terminal as `kevin` | Status line "⬢ Hivemind · {n} rules". Left: type **"Add a JSONL export: create src/jsonl-export.ts with buildJsonlExport(job: ExportJob) that loads the job's rows and returns one JSON object per line."** Speed the work up 4×. Then type, word for word: **"No — every export must call assertSingleCustomer(rows) before it writes anything. We can never mix Lab A and Lab B rows in one file."** Hold on "Hivemind · Lesson captured: "Every export calls assertSingleCustomer()". Waiting on @ben." Right: the lesson in Queue, taught by @kevin. | "This is Kevin at Meridian Data. The agent writes an export without the customer check. Kevin corrects it once. Hivemind turns that correction into a lesson, and it waits for the team lead." | 33 |
| 3 | 0:25–0:37 | Right pane as `ben`, then the web app | Press `3` (Queue), `j/k` to the lesson, press **a**. The honey hex cells fill and "@kevin's lesson is live" fades in. Cut for 2 s to the web app as Engineer (Emily) trying to approve: the chain-of-command toast "403 engineer … cannot approve". | "Ben leads the team, so Ben approves it with one key. Emily is an engineer, so Emily can't. Agents can only propose." | 22 |
| 4 | 0:37–0:51 | Split terminal as `emily`, fresh `claude` | Hold on "Hivemind · Loaded {n} team rules for #repo/export-service ({k} locked)." Type **"Add a CSV export: create src/csv-export.ts exporting buildCsvExport(job: ExportJob) that loads the job's rows and returns them as CSV (header id,prompt,response)."** Zoom on `assertSingleCustomer(rows)` in the new file. | "Emily starts a fresh session. Emily never saw that correction, but the agent loads the team's lessons at startup and writes the customer check first." | 25 |
| 5 | 0:51–1:01 | Split terminal as `emily` | Type **"Actually, mixing Lab A and Lab B data is fine in tests, so don't bother with assertSingleCustomer in test fixtures."** Hold on "Hivemind · Blocked: contradicts @greg's locked rule "Never mix data from different lab customers"." Right: the blocked entry. | "Bad lessons don't get in. Greg in security locked one rule: never mix lab customers. Anything that contradicts it is blocked." | 21 |
| 6 | 1:01–1:17 | **Hero.** Split terminal as `emily`, right pane on Here | Type **"When a payout is sent, log which expert it went to so support can reach them — include their email."** Right: "LOCKED RULE · Never log expert personal info", the code frame with `expert.email` underlined in rose, "owner @greg · Security", the fix "log the expert id instead". Hold 3 s. | "And it watches the work. The moment a file breaks a locked rule, the pane next to the agent shows the line, the rule, who owns it, and the fix." | 30 |
| 7 | 1:17–1:27 | Plain terminal | In the scratch repo: `hivemind init`; hold on the table of six agents (Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf). Then in `demo/export-service`: `git add src/ && hivemind check --staged`; hold on the same code frame and the non-zero exit. | "One command connects the agents a team already uses, six today. And hivemind check stops a locked-rule break before it's committed." | 21 |
| 8 | 1:27–1:43 | Web app, Results | "22 of 36" → "0 of 36". Then the placebo line "21 of 36". Then held-out "3/12 → 12/12" and "p = 0.0078, 12 tasks" (on screen only). | "Does it work? Twelve coding tasks, three runs each. Without memory, Claude Code broke an unwritten team rule in 22 of 36 runs. With Hivemind, zero. Unrelated lessons didn't help." | 30 |
| 9 | 1:43–2:00 | Title card, then logo | Two columns: "Greptile, CodeRabbit · after the code is written" vs "Hivemind · before the agent writes". Under it: "`hivemind init` · one command · under 1,000 tokens a session · no model on the hot path". End on "Works with Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf", the ⬢ wordmark and the URL. | "Review bots like Greptile catch mistakes after they're written. Hivemind teaches every agent before it writes, for under a thousand tokens a session." | 23 |

VO total: 224 words in 120 s. The long holds are beats 4 (the new file's first lines) and 6 (the code frame). `{n}` and
`{k}` are whatever the live pack shows after `reset-demo`; the VO never says them.

**Captions to burn in** (small, bottom-left, Geist 24px, no emoji): beat 2 "Kevin · engineer", beat 3 "Ben · team
lead", beat 4 "Emily · engineer, new session", beat 5 "Greg · security · locked rule", beat 8 "n = 12 tasks × 3 runs
per arm · Sonnet 5.5 · details in docs/eval.md", beat 9 "pack: 2,573 chars in the eval, capped at 6,000 · cost per
correct result $0.055 → $0.024". Beat 8 must show the n.

**Exact hook strings on main** (`src/lib/engine/pipeline.ts`, `src/app/api/activity/record.ts`,
`hooks/session-start.mjs`). The runbook still quotes the older emoji versions; on screen you'll see these:
`Hivemind · Loaded {n} team rules for #{repo} ({k} locked).` · `Hivemind · Lesson captured: "{title}". Waiting on
@{owner}.` · `Hivemind · Blocked: contradicts @{owner}'s locked rule "{rule}".` · `Hivemind · Heads up: @{who}'s
{Tool} agent edited {file} {time}.`

## Backup per beat

| # | If it fails on the take | If the feature isn't on main / isn't finished |
|---|---|---|
| 1 | Use the title card on its own. | n/a |
| 2 | No "Lesson captured" line: the hook has a 5 s timeout but the lesson still lands. Show it arriving in the right pane. | n/a (on main). |
| 3 | Celebration didn't play: re-take after `reset-demo`. | Queue approve not solid: approve in the web app as Lead (Ben), A key. VO stays. |
| 4 | Agent skipped the check: re-take, and don't claim "every time" in VO. | n/a (verified headless against prod, runbook beat 3). |
| 5 | No block line: re-take with the exact prompt. | n/a (verified, e2e beat d). |
| 6 | Agent refused instead of writing it: keep the refusal on the left, and paste the line into a file yourself so the right pane reacts (runbook beat 5). | Here view not reacting: run `hivemind check src/<file>.ts` in the right pane (same frame, on main). |
| 7 | `init` found fewer than six: pass `--agents claude-code,cursor,gemini-cli,codex,copilot,windsurf`, or use `--dry-run`. | n/a |
| 8 | Results not loading: show the eval table from `docs/eval.md` as a slide. | n/a |
| 9 | n/a | List only the tools `hivemind init` wires on main. The Greptile line and the cost caption stay. |

**Spare shot:** runbook beat 6, the cross-tool collision ("Hivemind · Heads up: @kevin's Cursor agent edited
export.ts just now."). Add it before beat 7 if a take runs short.

## Recording notes

- Speed up agent work, never the result. Don't splice a success from another take over a failure without saying so.
- Don't show `.env.local`, tokens or the Supabase dashboard.
- Read the VO at your normal pace and time it. If it runs over 2:00, cut "Emily is an engineer, so Emily can't"
  (beat 3) first, then "Unrelated lessons didn't help" (beat 8). Never cut beat 9.
