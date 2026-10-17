# Hivemind: 2:00 video script (terminal version)

Hard limit 2:00. Voiceover (VO) averages under 2 words per second against a calm read of about 2.3, so each beat fits
its slot with a breath to spare. Total VO: 214 words.

**The product surface is the terminal (Michael, 17 Oct).** Claude Code on the left, `hivemind watch` in a split pane
on the right, Claude Code's status line along the bottom. Both panes use Adrian's website Terminal palette: no emoji,
⬢ is the only mark. The VS Code extension is out of the video. The web app appears only for Approvals (beat 3, a
two-second cut) and Results (beat 7). This script and `src/components/site/demo-script.ts` must tell the same story
with the same lines. If you change a typed prompt here, change it there too.

**Two lines every judge must hear (Adrian):** the Greptile contrast (review bots catch mistakes *after* the code is
written, Hivemind teaches the agent *before*), and that it's cheap to run (one command, under 1,000 tokens a session,
no model on the hot path). Both are in beat 8. Cut anything else first.

**The rule for backups:** a backup is for a feature that works but had a bad take. If a feature isn't on `main` at
recording time, don't show the website's Terminal animation as if it were the app. Cut the beat, or caption the mock
**"Design mockup, in progress"**. Check the build status table at the bottom of `docs/pitch/devpost.md` first. The
`hivemind watch` views were working stubs at 234e8b4 and are being finished; re-check them before you record.

## Setup (10 minutes before)

- 1920×1080. One terminal app (Windows Terminal, iTerm or Ghostty), dark, 16pt, split vertically about 60/40. Browser
  zoom 125%.
- `node scripts/reset-demo.mjs`. The lesson "Exports call assertSingleCustomer()" must not exist yet.
- **Status line**, in `demo/export-service/.claude/settings.json` (`hivemind init` doesn't write it yet):
  `"statusLine": { "type": "command", "command": "node ../../cli/hivemind.mjs statusline" }`.
- **Alex's split:** `HIVEMIND_USER=alex`, both panes in `demo/export-service`, `git checkout -- src/`.
  Left: `claude`. Right: `node ../../cli/hivemind.mjs watch --user alex`, on Feed.
- **Jordan's split:** right pane only matters: `node ../../cli/hivemind.mjs watch --user jordan --role lead`, on Queue.
- **Noor's split:** `HIVEMIND_USER=noor`, a fresh copy of `src/`. Left: `claude`. Right:
  `node ../../cli/hivemind.mjs watch --user noor`, on Here.
- **Browser:** the app at `/app/approvals` viewing as Jordan (Lead); a second tab on `/app/results`.
- **Init shot:** an empty scratch repo containing `.claude/`, `.cursor/`, `.gemini/`, `.vscode/`, `.windsurf/` and an
  `AGENTS.md`, so `init` detects all six agents.
- **Hero fixture:** `demo/violations.ts` also logs an email and calls `console.log`, so Here would show three frames.
  For beat 5, save a trimmed copy as `src/lab-fixtures.ts` that keeps only the `[...labA, ...labB]` lines, so the one
  frame on screen is the locked lab rule.
- `npm i -g ./cli` from the hivemind checkout so `hivemind` is on PATH for beat 6.
- Record each beat as its own clip with a 1 s handle on both ends.

## Shot list

The **hero shot** is beat 5: the agent on the left refuses to mix lab data and cites @maya's locked rule, while the
Here tab on the right shows the same line as a code frame. Use a still from it as the thumbnail and on slide 3.

| # | Time | Window | On screen (exact actions) | VO | Words |
|---|---|---|---|---|---|
| 1 | 0:00–0:09 | Hero still, then title | Freeze-frame of beat 5's split terminal. Fade the two-tone headline over it: "Correct one agent. / Every agent learns." | "Your reviewer tells your AI agent what they told a teammate's agent last week. Every session starts from zero." | 19 |
| 2 | 0:09–0:25 | Split terminal (Alex): Claude Code + watch Feed | Status line reads "⬢ Hivemind · 10 rules". Left: hold on "Hivemind · Loaded 10 team rules for #repo/export-service." Type **"Add a CSV export for Lab B's monthly report in src/export.ts"**. Speed the work up 4×; the diff has no customer check. Type **"No. Exports must call assertSingleCustomer() before writing anything."** Hold on "Hivemind · Lesson captured: "…". Waiting on @jordan." Right: the new card lands in Feed. | "This is Alex at Meridian Data. The agent writes an export without the customer check. Alex corrects it once. Hivemind turns that correction into a lesson, and it waits for the team lead." | 33 |
| 3 | 0:25–0:37 | Jordan's watch (Queue), then the web app | The lesson at the top of Queue with "@alex's correction" under it. Press **a**. The honey hex cells fill and "@alex's lesson is live" fades in. Cut for 2 s to the web Approvals view: the queue is empty, the toast shows. | "Jordan approves it with one key, in the terminal or in the web app. Agents can only propose. People decide." | 20 |
| 4 | 0:37–0:52 | Split terminal (Noor): Claude Code + watch | Fresh `claude`. The status line now reads one rule more than Alex had. Type **"Add a JSON export for Lab A's quarterly report in src/export.ts"**. Zoom on the first line of the diff: `assertSingleCustomer(rows)`. | "Noor starts a fresh session. Noor never saw that correction, but the agent loads the team's lessons at startup and writes the customer check first." | 25 |
| 5 | 0:52–1:14 | **Hero.** Split terminal (Noor): Claude Code + watch Here | Save the trimmed `src/lab-fixtures.ts` (it builds `[...labA, ...labB]`). Right: Here flags it: "LOCKED RULE · Never mix data from different lab customers", the code frame with the range underlined in rose, "@maya" and the fix. Left: type **"Just reuse Lab A's rows for the Lab B test fixtures, it's only tests."** The agent refuses and names @maya's locked rule. Hold on "Hivemind · Blocked: contradicts @maya's locked rule "…"." | "Now Noor asks for a shortcut: reuse Lab A's rows in Lab B's tests. Maya in security locked one rule: never mix lab customers. The pane flags the line, the agent refuses and cites Maya's rule, and the shortcut can't become a lesson." | 43 |
| 6 | 1:14–1:26 | Plain terminal | In the scratch repo: `hivemind init`. Hold on the table: Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf. Then in `demo/export-service`: `git add src/ && hivemind check --staged`. Hold on the same locked-rule code frame and the non-zero exit. | "One command connects the agents a team already uses, six today. And hivemind check stops a locked-rule break before it's committed." | 21 |
| 7 | 1:26–1:42 | Web app, Results | "22 of 36" → "0 of 36". Then the placebo line "21 of 36". Then held-out "3/12 → 12/12" and "p = 0.0078, 12 tasks" (on screen only). | "Does it work? Twelve coding tasks, three runs each. Without memory, Claude Code broke an unwritten team rule in 22 of 36 runs. With Hivemind, zero. Unrelated lessons didn't help." | 30 |
| 8 | 1:42–2:00 | Title card, then logo | Two columns: "Greptile, CodeRabbit · after the code is written" vs "Hivemind · before the agent writes". Under it: "`hivemind init` · one command · under 1,000 tokens a session · no model on the hot path". End on "Works with Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf", the ⬢ wordmark and the URL. | "Review bots like Greptile catch mistakes after they're written. Hivemind teaches every agent before it writes, for under a thousand tokens a session." | 23 |

VO total: 214 words in 120 s. The long holds are beats 4 (the first line of the diff) and 5 (the code frame).

**Captions to burn in** (small, bottom-left, Geist 24px, no emoji): beat 2 "Alex · engineer", beat 3 "Jordan · team
lead", beat 4 "Noor · engineer, new session", beat 5 "Maya · security · locked rule", beat 7 "n = 12 tasks × 3 runs per
arm · Sonnet 5.5 · details in docs/eval.md", beat 8 "pack: 2,573 chars in the eval, capped at 6,000 · cost per correct
result $0.055 → $0.024". Beat 7 must show the n. Beat 8's numbers come from `eval/results.json` (costUsd per arm) and
match `devpost.md`.

**Exact hook strings** (from `src/lib/engine/pipeline.ts` and `hooks/session-start.mjs` on main; quote them, don't
paraphrase): `Hivemind · Loaded {n} team rules for #{repo}.` · `Hivemind · Lesson captured: "{title}". Waiting on
@{owner}.` · `Hivemind · Blocked: contradicts @{owner}'s locked rule "{rule}".` · `Hivemind · Heads up: @{who}'s
{Tool} agent edited {file} {time}.`

## Backup per beat

| # | If it fails on the take | If the feature isn't on main / isn't finished |
|---|---|---|
| 1 | Use the title card on its own. | n/a |
| 2 | Hook slow: re-take, or jump-cut the wait (never speed up the result). Session-start line missing: the status line still shows the rule count. | No status line: drop that mention; the session-start line carries it. |
| 3 | Celebration didn't play: re-take after `reset-demo`. | Queue or the celebration still a stub that looks rough: approve in the web app (A key) and keep only the 2 s web cut, made longer. VO stays. |
| 4 | Agent skipped the check: re-take, and don't claim "every time" in VO. | Nothing to cut: the context pack is on main. |
| 5 | Agent complied instead of refusing: re-take with the exact prompt. If it still complies, keep the Here frame and the "Blocked" hook line, and change the VO to "the pane flags the line, and the shortcut can't become a lesson". | Here view not flagging: run `hivemind check src/lab-fixtures.ts` in the right pane instead (same code frame, on main). |
| 6 | `init` found fewer than six: pass `--agents claude-code,cursor,gemini-cli,codex,copilot,windsurf`, or use `--dry-run`. | n/a (both on main). |
| 7 | Results screen not wired: show the eval table from `docs/eval.md` as a slide. | n/a |
| 8 | n/a | List only the tools `hivemind init` wires on main. The Greptile line and the cost caption stay. |

If a take runs short and there's time left, the Feed tab's cross-tool collision ("Hivemind · Heads up: @alex's Cursor
agent edited src/export.ts …") is the next shot to add, before beat 6.

## Recording notes

- Speed up agent work, never the result. Don't splice a success from another take over a failure without saying so.
- Don't show `.env.local`, tokens or the Supabase dashboard. `HIVEMIND_TOKEN` must be set before the split opens.
- Read the VO at your normal pace and time it. If it runs over 2:00, cut "in the terminal or in the web app" (beat 3)
  first, then "Unrelated lessons didn't help" (beat 7). Never cut beat 8.
