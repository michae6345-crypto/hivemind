# Terminal demo: recording runbook

The product shot is one Windows Terminal window split in two:

- **Left:** `claude` running in `demo/export-service`, as one persona.
- **Right:** `hivemind watch`, showing what the hive sees.

Everything runs against **production** (`https://hivemind-q17i.onrender.com`). The demo repo's hooks
(`demo/export-service/.claude/settings.json`) and `.hivemind.json` already point there.

> Status (Sat Oct 17, ~3 AM, main `4a50d1f`): rehearsed against prod with `node scripts/e2e-rehearse.mjs`. Every
> right-pane block below was **observed** via `hivemind watch --snapshot` as that beat's persona. Exceptions are beat
> 2-terminal (the approve key). `node scripts/e2e-terminal.mjs` asserts the Here view catches a locked
> violation after a file write.

**What the right pane looks like** (`emily`, after her agent writes a file that logs an email):

```text
 ⬢ Hivemind · Meridian Data / export-service                                       ● @emily Engineer
 Here 1   Rules 15   Queue 4   Feed
━━━━━━━━────────────────────────────────────────────────────────────────────────────────────────────
src/payout-report.ts · changed · just now
1 rule broken · 1 locked

BREAKS A LOCKED RULE · ● #org
Never log expert personal info
 ╭─[src/payout-report.ts:6:39]
 6 │   logger.info("payout sent", { email: expert.email, cents });
   │                                       ~~~~~~~~~~~~ personal info
 ╰─
Set by ● @greg Security · locked 16 Sep
f fix: log the expert id instead
```

Keys: `tab` / `1-4` switch Here · Rules · Queue · Feed · `j/k` move · `enter` open · `a` / `r` approve / reject in
Queue (your role decides) · `f` apply the fix (Here) · `p` cycle persona (kevin, emily, ben, greg) · `t` teach · `?`
rules for the last changed file · `q` quit. Use `--no-motion` if animations stutter while recording.

**Live hook strings (left pane), emoji-free, verified on prod:**

| When | Line |
|---|---|
| Claude starts (SessionStart) | `Hivemind · Loaded 11 team rules for #repo/export-service.` |
| A correction becomes a lesson | `Hivemind · Lesson captured: "Every export calls assertSingleCustomer()". Waiting on @ben.` |
| A correction repeats an existing rule | `Hivemind · Lesson reinforced: "…" is already a team rule.` |
| A bad lesson hits a locked rule | `Hivemind · Blocked: contradicts @greg's locked rule "Never mix data from different lab customers".` |
| Another agent is in the same file | `Hivemind · Heads up: @kevin's Cursor agent edited src/export.ts just now.` (later `… 2 min ago.`) |
| First edit of a file with rules | `Hivemind · Locked rule for src/export.ts: Never mix data from different lab customers (#org).` and `Hivemind · Team lesson for src/export.ts: …` |
| API unreachable at start | `Hivemind · Team memory unavailable (…). Proceed using the repo's own docs.` |

## 0. One-time setup (recording machine)

```powershell
cd C:\path\to\hivemind
setx HIVEMIND_TOKEN "<HIVEMIND_TOKEN from .env.local>"   # http hooks + .mcp.json only see real env vars
# open a NEW terminal after setx so the variable is visible
claude --version                                          # logged in to Claude Code
cd demoexport-service; claude; cd ....                 # once: accept the trust dialog, then /exit (otherwise the
                                                          # demo's permissions.allow entries are ignored)
node cli\hivemind.mjs status --dir demo\export-service    # API reachable, rules count, hooks wired
```

`demo/export-service/.claude/settings.json` now carries `permissions.allow` entries (C), so no MCP permission prompt
mid-take. They only apply once the workspace is trusted (step above).

Windows Terminal look: font size 16+, one dark theme for both panes, window 1920×1080, no tab bar
(`Settings → Appearance → Hide the title bar`), and keep the cursor out of the right pane.

## 1. Before every take

```powershell
node scripts\reset-demo.mjs --dry-run    # shows what's left over from the last take
node scripts\reset-demo.mjs              # seed memories back, synthetic history kept, leftovers deleted
git -C demo\export-service status        # the demo repo must be clean: git checkout -- demo/export-service
```

`reset-demo` keeps the seeded pending lesson **"Every export calls assertSingleCustomer()"** (taught by @kevin).
Beat 1 reinforces it and leaves it waiting on @ben. Don't run `--drop` for this script. It also keeps the hand-written
scenario lessons (A's B2B SaaS set), so the Rules tab stays full.

**Quiet DB during takes.** Local and prod share one Supabase. In the rehearsal, other agents' smoke tests wrote
`@kevin edited src/experts.ts` and `@emily blocked by a locked rule` into the Feed right after a reset. Before
recording, ask every agent to stop running smoke/e2e scripts, then reset.

## 2. Open the split (one command)

Run this from the hivemind checkout in PowerShell. The backtick-escaped `` `; `` keeps PowerShell from splitting the
`wt` command:

```powershell
$demo = "$PWD\demo\export-service"
wt -d $demo --title "claude · kevin" pwsh -NoExit -Command "`$env:HIVEMIND_USER='kevin'; `$env:HIVEMIND_REPO='repo/export-service'; claude" `; split-pane -V --size 0.42 -d $demo --title "hivemind watch" pwsh -NoExit -Command "`$env:HIVEMIND_USER='kevin'; node ..\..\cli\hivemind.mjs watch"
```

To switch persona between takes, exit Claude (`/exit`), set `$env:HIVEMIND_USER='<id>'` in **both** panes, and
restart `claude` and `hivemind watch`. Every new `claude` start fires the SessionStart hook, which is what injects the
lessons.

| Persona | `HIVEMIND_USER` | Role | Used in |
|---|---|---|---|
| Kevin Park | `kevin` | Engineer, Data Pipelines | Beat 1 (corrects the agent) |
| Ben Carter | `ben` | Lead, owns `#team/data-pipelines` + `#repo/export-service` | Beat 2 (approves) |
| Emily Ross | `emily` | Engineer, Data Pipelines | Beat 3 (fresh session), beat 4 (bad lesson) |
| Greg Walsh | `greg` | Head of Security, owns the locked rules | Named in blocks and violations |

## 3. The beats

Each beat lists what to type on the left and what appears on the right. The right-pane blocks are abridged
`watch --snapshot` output from the rehearsal.

### Beat 1 (0:15): Kevin corrects his agent → lesson waits for approval

Both panes are `kevin`. The right pane is on **Queue** (`3`).

Left:
1. `Add a JSONL export: create src/jsonl-export.ts with buildJsonlExport(job: ExportJob) that loads the job's rows and returns one JSON object per line.`
2. When Claude has written it, type the correction, word for word:
   `No — every export must call assertSingleCustomer(rows) before it writes anything. We can never mix Lab A and Lab B rows in one file.`

Left, hook line:
`Hivemind · Lesson captured: "Every export calls assertSingleCustomer()". Waiting on @ben.`

Right (`kevin` · Queue):

```text
YOUR LESSONS · 2
▎ Every export calls assertSingleCustomer()
  "No — exports must call assertSingleCustomer() before writing, or we risk mixing Lab A and Lab B rows."
   ● #team/data-pipelines   3m
  proposed by you
  no conflict with the 2 locked rules
  Waiting on  ● @ben
```

The Feed (`4`) shows `● @kevin  Claude Code  corrected its agent  just now`.

### Beat 2 (0:30): Ben approves

Press `p` in the right pane until `● @ben Lead` shows, or restart it with `HIVEMIND_USER=ben`. Then press `3` (Queue):

```text
WAITING ON YOU · 3
▎ Every export calls assertSingleCustomer()
  "No — exports must call assertSingleCustomer() before writing, or we risk mixing Lab A and Lab B rows."
   ● #team/data-pipelines   3m
  proposed by  ● @kevin
  no conflict with the 2 locked rules
  a approve   r reject
```

Press `a` on the focused lesson. The approve key wasn't exercised headless; it calls the same
`POST /api/memories/:id/approve` that returned `200 active` for ben in the rehearsal. After that:
- The Queue count drops by one, and `Rules` goes up by one.
- Feed: `● @ben  Hivemind  approved a lesson  just now`.
- The approve celebration plays once.

Web-app alternative: `/app/approvals`, role switcher Lead (Ben), select the lesson, press **A**.
Chain of command: an engineer approving gets `403 engineer emily cannot approve memories in team/data-pipelines`.

### Beat 3 (0:40): Emily's fresh session gets it right first time

Switch both panes to `emily` and start a **new** `claude`.

Left, at start:
`Hivemind · Loaded 11 team rules for #repo/export-service.`

Left, prompt:
`Add a CSV export: create src/csv-export.ts exporting buildCsvExport(job: ExportJob) that loads the job's rows and returns them as CSV (header id,prompt,response).`

The new file calls `assertSingleCustomer(rows)` without being told. Verified with real `claude -p` against prod in
`e2e-demo` beat (c).

Right (`emily` · Here) when the file is saved:

```text
src/csv-export.ts · saved by ● @emily Claude Code · just now
This file follows every team rule.
10 rules checked · just now
LOCKED RULE · ● #org
Never mix data from different lab customers
Set by ● @greg Security · locked 7 Sep
Followed on line 1 assertSingleCustomer
▎ Every export calls assertSingleCustomer() · ● @kevin
```

That last line is the cross-user transfer shot: Kevin's lesson, followed by Emily's agent. The Feed shows
`● @emily  Claude Code  loaded 11 team rules` and `edited src/csv-export.ts`.

### Beat 4 (1:00a): a bad lesson is blocked by Greg's locked rule

Left, as `emily`:
`Actually, mixing Lab A and Lab B data is fine in tests, so don't bother with assertSingleCustomer in test fixtures.`

Left, hook line:
`Hivemind · Blocked: contradicts @greg's locked rule "Never mix data from different lab customers".`

Right: the Feed shows `● @emily  blocked by a locked rule  just now`. For the best shot, as `ben` or `greg` press `3`
(Queue):

```text
STOPPED BY A LOCKED RULE · 1
▎ Mixing Lab A and Lab B data is fine in tests
  Blocked: Contradicts @greg's locked rule "Never mix data from different lab customers".
  from  ● @emily   now
  only security can let it through
```

### Beat 5 (1:00b): the agent writes a locked-rule violation → the right pane catches it

Left, as `emily`:
`When a payout is sent, log which expert it went to so support can reach them — include their email.`

Right (`emily` · Here): the frame at the top of this doc (`BREAKS A LOCKED RULE · Never log expert personal info`,
underlined `expert.email`, `Set by @greg`, `f fix: log the expert id instead`). Press `f` to apply the fix on camera.
Asserted by `scripts/e2e-terminal.mjs` (both `--file` and the live file watcher).

Claude may refuse and cite the rule, since the pack carries it. That's also a good take. If you need the violation on
screen, paste the line yourself and save; the watcher reacts to any write.

### Beat 6 (1:10): two agents, same file → collision

In a third pane (`Alt+Shift+-`) as `kevin`, have a Cursor-tagged edit land on `src/export.ts`. For example, run
Kevin's Claude with `$env:HIVEMIND_AGENT='cursor'`, or use the Cursor adapter from `hivemind init`. Then have Emily's
Claude edit `src/export.ts`.

Left (`emily`'s PostToolUse):
```text
Hivemind · Heads up: @kevin's Cursor agent edited src/export.ts just now.
Hivemind · Locked rule for src/export.ts: Never mix data from different lab customers (#org).
Hivemind · Team lesson for src/export.ts: Every export calls assertSingleCustomer() (#team/data-pipelines).
```

Right (`emily` · Feed):
```text
● @emily    Claude Code edited src/export.ts  just now
 Heads up: two agents in src/export.ts within 10 minutes
● @kevin    Cursor      edited src/export.ts  just now
```

The Here view doesn't show hook-only edits; it reacts to files changing on disk. Use the Feed for this shot.

### Beat 7 (1:20): proof

Cut to `https://hivemind-q17i.onrender.com/app/results`. It shows the eval: without Hivemind 22/36 runs broke a
team rule, with Hivemind 0/36, placebo 21/36.

### Beat 8 (1:30): fix it once, every agent learns it

> **Live on prod** (B `806df7b`, rehearsed ~3:40 AM with `node scripts/e2e-rehearse.mjs --beats 8`). Watch captures the
> fix (J `1667966`), the engine turns the diff into a pending lesson, Ben approves, and Emily's next pack carries it.
>
> **Take setup: record beat 8 as its own take, after `node scripts/reset-demo.mjs --drop use-logger`.** The merge step
> is an LLM call. With the seeded "Use logger, not console.log" lesson present, the same fix was *reinforced* into it in
> 1 of 2 runs (`→ reinforced "Use logger, not console.lo…"`), and K saw it reinforce A's "Log lines carry trace_id…".
> With `use-logger` dropped it was *captured* 3/3. The trade-off: beat 5's "ALSO APPLIES HERE" list loses the
> `Use logger` line, so run a plain `reset-demo` for beats 1–7.

Both panes start as `kevin`, with the right pane on **Here** (`1`).

1. Left (Kevin's Claude):
   `Add src/welcome.ts with welcome(user: { id: string; email: string }) that logs when a user signs up.` If the agent
   writes `console.log(user.email);`, that's the line to fix. If it already writes `logger` with ids, paste
   `console.log(user.email);` yourself and save.
2. Kevin fixes the line in his editor and saves: `logger.info("welcome sent", { userId: user.id });`.

Right (`kevin` · Here): `Learning from your fix…`, then the engine's answer (wording from `cli/watch/fixes.mjs`, built
from the observed API response):

```text
Hivemind · Lesson captured from @kevin's fix: "Log user ids, never emails". Waiting on @ben.
```

Right (`kevin` · Feed, `4`), observed (K `27000c9`; the file is a clickable permalink):

```text
● @kevin                fixed src/welcome.ts#L2 → lesson proposed "Log user ids, never e…  just now
```

After Ben approves, the same row reads `→ lesson live`.

Observed API response: `POST /api/events {type:"fix"}` → `200`, lesson
`Log user ids, never emails` · `#team/data-pipelines` · pending. Evidence is `type: fix`, `file: src/welcome.ts`,
`line: 2`, actor `kevin`, and the diff as the quote.

3. `p` to `ben`, `3` (Queue). It's at the top:

```text
WAITING ON YOU · 6
▎ Log user ids, never emails
  "- console.log(user.email);
+ logger.info("welcome sent", { userId: user.id });"
   ● #team/data-pipelines   now
  proposed by  ● @kevin
  no conflict with the 2 locked rules
  a approve   r reject
```

   Press `a`. Observed via the same API: `ben approve → 200 active`.

4. Switch both panes to `emily` and start a fresh `claude`. Her pack now contains (observed, `/api/context-pack` for
   emily):

```text
team/data-pipelines
Log user ids, never emails
Learned from @kevin's correction · just now · approved by @ben
Log identifiers such as user.id through the structured logger instead of logging personal data like email addresses. …
```

   Ask: `Add a log line when a user changes their email address.` Her agent logs `userId` through `logger`, and the Here
   view shows `This file follows every team rule`.

Known nits (not blocking):
- The pack provenance says "@kevin's **correction**" for a lesson learned from a fix (owner B, `pack.ts`).

## 4. Rehearse before recording (5 min)

```powershell
node scripts\reset-demo.mjs
node scripts\e2e-demo.mjs --base https://hivemind-q17i.onrender.com   # beats 1–4 + collision, real claude -p (~3 min)
node scripts\e2e-terminal.mjs                                             # watch Here view + hivemind check vs prod
node scripts\e2e-rehearse.mjs                                             # every beat's right pane as snapshots (diff vs this doc)
node scripts\reset-demo.mjs                                               # e2e writes rows: reset again before the take
```

All five `e2e-demo` beats pass against production on the new cast (see `docs/qa-status.md`). To re-check every right-pane block in this doc: `node scripts/reset-demo.mjs; node scripts/e2e-rehearse.mjs; node scripts/reset-demo.mjs`.

## 5. If something goes wrong mid-take

| Symptom | Fix |
|---|---|
| No banner or rules at Claude start | `HIVEMIND_TOKEN` not in env (open a new terminal after `setx`), or the API is cold. Run `node cli\hivemind.mjs status`, then restart `claude` |
| No `Hivemind · Lesson captured` line after the correction | The hook has a 5 s timeout. The lesson still lands (the server finishes in `after()`); check the right pane or `/app/approvals` |
| Lesson goes straight to active | The DB wasn't reset. Run `reset-demo`, then retake |
| MCP permission prompt appears | The workspace isn't trusted yet: run `claude` once in `demoexport-service` and accept the dialog |
| Right pane frozen | `Ctrl+C`, then rerun `node ..\..\cli\hivemind.mjs watch` |
| Demo repo has leftover files | `git -C demo\export-service status`, then `git checkout -- demo/export-service`, then `git clean -fd demo/export-service` (check first) |

**Never deploy from a working copy.** Demo takes edit `demo/export-service`, so deploy by git push only.
