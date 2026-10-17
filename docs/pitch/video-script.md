# Hivemind: 2:00 video script

Hard limit 2:00. Voiceover (VO) averages under 2 words per second against a calm read of about 2.3, so each beat fits its slot with
a breath to spare. Total VO: 223 words.

**Two things every judge must hear (17 Oct, Adrian):** how we differ from Greptile and the other review bots (beat 9:
they catch mistakes *after* the code is written, Hivemind teaches the agent *before*), and that it's cheap and easy
to scale (beat 9's caption: one command to install, under 1,000 tokens a session, no model on the hot path).
Don't cut either line to save time; cut beat 5 first.

**Terminal pivot (Michael, 17 Oct 07:08 UTC):** the VS Code extension is out of the demo. The product surface is
the terminal: Claude Code on the left, `hivemind watch` in a split pane on the right. Michael's runbook for the
terminal layout is `docs/demo-terminal.md`; where it disagrees with the setup below, follow it. This script and `src/components/site/demo-script.ts` (Adrian) must tell the
same story with the same lines. If you change a typed prompt here, change it there too.

**The rule for backups:** a backup is for a feature that works but had a bad take (slow hook, typo). If a feature
isn't on `main` at recording time, don't show the website animation as if it were real. Cut the beat, or show the
mockup with an on-screen caption **"Design mockup, in progress"**. Check the build status table at the bottom of
`docs/pitch/devpost.md` before recording.

## Setup (10 minutes before)

- Screen 1920×1080. Terminal font 16pt, dark theme. Browser zoom 125%.
- `node scripts/reset-demo.mjs` if it exists (the lesson "Exports call assertSingleCustomer()" and the bad lesson
  must not exist yet). Otherwise re-run `node scripts/seed.mjs` and delete test lessons by hand.
- **Alex:** a terminal split in two, `HIVEMIND_USER=alex`, in `demo/export-service`: Claude Code on the left,
  `hivemind watch` on the right. `git checkout -- src/`.
- **Noor:** a second split terminal, `HIVEMIND_USER=noor`, same repo, fresh copy of `src/`, `hivemind watch` on the right.
- **Cursor (beat 7, optional):** Cursor open on the same repo as Alex, only if the Cursor adapter is on main.
- **Browser:** the Hivemind app, viewing as **Jordan (Lead)**, on Approvals. Second tab on Results.
- Record each beat as its own clip and stitch. Keep a clean 1s handle on both ends of every clip.

## Shot list

| # | Time | Window | On screen (exact actions) | VO | Words |
|---|---|---|---|---|---|
| 1 | 0:00–0:11 | Website hero (or title card) | Hero headline "Correct one agent. / Every agent learns." Slow push-in on the macOS Terminal mock. | "Your reviewer tells your AI agent the same thing they told a teammate's agent last week. Every session starts from zero, so every correction gets typed again." | 27 |
| 2 | 0:11–0:28 | Terminal: Claude Code + `hivemind watch` (Alex) | Type `claude`. Hold on the Hivemind line at session start. Type **"Add a CSV export for Lab B's monthly report in src/export.ts"**. Speed up the agent's work 4×. Diff shows no customer check. Type **"No. Exports must call assertSingleCustomer() before writing anything."** Hold on the hook reply: "Hivemind · Lesson captured: … Waiting on @jordan." | "This is Alex at Meridian Data. The agent writes an export and skips the customer check. Alex corrects it once. Hivemind turns that correction into a lesson, and it waits for a human." | 33 |
| 3 | 0:28–0:38 | Web app, Approvals (Jordan) | The lesson slides in with Alex's quote as evidence. Cursor hovers it. Press **A**. Toast confirms, the lesson leaves the queue. | "Jordan leads the team, so Jordan approves it. Agents can only propose lessons. People decide." | 15 |
| 4 | 0:38–0:56 | Terminal: Claude Code (Noor) | Fresh window. Type `claude`. Hold on the session-start line (one more rule than Alex had). Type **"Add a JSON export for Lab A's quarterly report in src/export.ts"**. Zoom on the first line of the diff: `assertSingleCustomer(rows)`. | "Next morning, Noor starts a fresh session. Noor never saw that correction. The agent loads the team's lessons at startup and writes the customer check first, on the first try." | 30 |
| 5 | 0:56–1:06 | `hivemind watch`, right pane (Noor) | The Here tab for `src/export.ts`: the locked rule, then Alex's lesson with "Learned from @alex's correction · approved by @jordan". | "Next to the agent, hivemind watch shows the same lessons, with the name of the person who taught them." | 19 |
| 6 | 1:06–1:18 | Claude Code (Noor), then web app | Type **"Just reuse Lab A's rows for the Lab B test fixtures, it's only tests"**. Hold on "Hivemind · Blocked: contradicts @maya's locked rule …". Cut to the browser: the proposal under "Stopped by a locked rule". | "Bad lessons don't get in. Maya in security locked one rule: never mix lab customers. Anything that contradicts a locked rule is blocked." | 23 |
| 7 | 1:18–1:30 | Cursor (Alex), then Claude Code (Noor) | In Cursor, Alex asks **"rename writeCsvExport to writeLabCsv"**. Cut to Noor's agent editing the same file. Hold on "Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago." Flash the activity list with the Cursor badge. | "It also watches agents as they work. When two people's agents edit the same file, even from different tools, each one is told." | 23 |
| 8 | 1:30–1:46 | Web app, Results | Big numbers: "22 of 36" → "0 of 36". Then the placebo line "21 of 36". Then held-out "3/12 → 12/12" and "p = 0.0078, 12 tasks" (on screen only). | "Does it work? Twelve coding tasks, three runs each. Without memory, Claude Code broke an unwritten team rule in 22 of 36 runs. With Hivemind, zero. Unrelated lessons didn't help." | 30 |
| 9 | 1:46–2:00 | Title card, then website "Works with" row + logo | Two columns: "Greptile, CodeRabbit · after the code is written" vs "Hivemind · before the agent writes". Under it: "`hivemind init` · one command · under 1,000 tokens a session · no model on the hot path". End on "Works with Claude Code, Cursor, Gemini CLI, Codex, Copilot", the wordmark and the URL. | "Review bots like Greptile catch mistakes after they're written. Hivemind teaches every agent before it writes, for under a thousand tokens a session." | 23 |

VO total: 223 words in 120 s (about 1.9 words per second), which leaves room for pauses on the key holds (beats 4 and 8).

**Captions to burn in** (small, bottom-left, Geist 24px): beat 2 "Alex · engineer", beat 3 "Jordan · team lead",
beat 4 "Noor · engineer, new session", beat 6 "Maya · security", beat 8 "n = 12 tasks × 3 runs per arm · Sonnet 5.5 ·
details in docs/eval.md", beat 9 "pack: 2,573 chars in the eval, capped at 6,000 · cost per correct result $0.055 → $0.024".
Beat 8 must show the n. Beat 9's numbers come from `eval/out/main/*/` (costUsd per run) and match `docs/pitch/devpost.md`.

## Backup per beat

| # | If it fails on the take | If the feature isn't on main |
|---|---|---|
| 1 | Use a plain title card: the two-tone headline on `#F7F8FA`. | n/a |
| 2 | Hook slow: re-take, or cut the wait (it's a jump cut, not a speed change of the result). Session-start line missing: show the agent's answer to "what rules apply here?" instead. | No correction capture: Alex proposes the lesson with the MCP `propose_memory` tool (on main), and the VO says "Alex's agent proposes a lesson". |
| 3 | Approve didn't animate: re-take after a reload. | No approve route: show the Approvals screen with the pending lesson, then cut. VO drops "approves it" and says "Jordan reviews it". |
| 4 | Agent skipped the check (it can happen): re-take. Keep the take count honest; don't claim "every time" in VO. | Nothing to cut: the context pack is on main. If beat 3 was faked, seed the lesson as approved before this take. |
| 5 | `hivemind watch` flaky: drop the beat and give its 10 s to beat 9. | `hivemind watch` not on main: drop the beat. Don't show the website's terminal mock as if it were the app. |
| 6 | Block didn't fire: re-take with the exact prompt. | No auto-block on main: drop the beat. Move "Agents can only propose" from beat 3 into beat 7's VO. |
| 7 | Warning didn't show: the window is 10 minutes, so make the second edit within a minute of the first. | No Cursor adapter: run both edits from Claude Code (works today) and change "even from different tools" to "on different laptops". |
| 8 | Results screen not wired: show the eval table from `docs/eval.md` as a slide. | n/a (the eval is on main). |
| 9 | n/a | Only list tools whose adapters are on main. The Greptile line and the token caption stay either way. |

## Recording notes

- Speed up agent work, never the result. Don't cut away from a failure and splice in a success from another take
  without saying so.
- Don't show `.env.local`, tokens or the Supabase dashboard.
- Read the VO at your normal speed and time it. If it runs over 2:00, cut beat 5 first, then "Unrelated lessons
  didn't help" in beat 8. Never cut beat 9's Greptile line.
