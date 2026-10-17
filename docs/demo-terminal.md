# Terminal demo: recording runbook

The product shot is one Windows Terminal window split in two:

- **Left:** `claude` running in `demo/export-service`, as one persona.
- **Right:** `hivemind watch`, showing what the hive sees.

Everything runs against **production** (`https://hivemind-beta-virid.vercel.app`). The demo repo's hooks
(`demo/export-service/.claude/settings.json`) and `.hivemind.json` already point there.

> Status (Sat Oct 17, ~1 AM): `hivemind watch` is being built (agent K, `cli/watch/`). The right-pane lines below
> marked **(confirm)** are the intended content; re-check them against the real views before recording.
> `node scripts/e2e-terminal.mjs` asserts the key one (Here view shows the locked violation after a write) once
> `watch --snapshot` lands.

## 0. One-time setup (recording machine)

```powershell
cd C:\path\to\hivemind
setx HIVEMIND_TOKEN "<HIVEMIND_TOKEN from .env.local>"   # http hooks + .mcp.json only see real env vars
# open a NEW terminal after setx so the variable is visible
claude --version                                          # logged in to Claude Code
node cli\hivemind.mjs status --dir demo\export-service    # API reachable, rules count, hooks wired
```

Recommended before recording (owner **C**, `demo/export-service/.claude/settings.json`): add
`"permissions": { "allow": ["mcp__hivemind__*"] }`. Without it, Claude stops with an MCP permission prompt
mid-take when it calls `get_team_rules`.

Windows Terminal look: font size 16+, one dark theme for both panes, window 1920×1080, no tab bar
(`Settings → Appearance → Hide the title bar`), and keep the cursor out of the right pane.

## 1. Before every take

```powershell
node scripts\reset-demo.mjs --dry-run    # shows what's left over from the last take
node scripts\reset-demo.mjs              # seed memories back, synthetic history kept, leftovers deleted
git -C demo\export-service status        # the demo repo must be clean: git checkout -- demo/export-service
```

`reset-demo` keeps the seeded pending lesson **"Every export calls assertSingleCustomer()"** (taught by @kevin).
Beat 1 reinforces it and leaves it waiting on @ben. Don't run `--drop` for this script.

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
| Greg Walsh | `greg` | Head of Security, owns the 🔒 rules | Named in blocks and violations |

## 3. The beats

Each beat lists what to type on the left and what should appear on the right.

### Beat 1 (0:15): Kevin corrects his agent → lesson waits for approval

Left, as `kevin`:
1. `Add a JSONL export: create src/jsonl-export.ts with buildJsonlExport(job: ExportJob) that loads the job's rows and returns one JSON object per line.`
2. When Claude has written it, type the correction, word for word:
   `No — every export must call assertSingleCustomer(rows) before it writes anything. We can never mix Lab A and Lab B rows in one file.`

Expected:
- **Left:** the UserPromptSubmit hook adds `📝 Hivemind captured a lesson: "Every export calls assertSingleCustomer()" — pending approval by Ben Carter`.
- **Right:** a new pending lesson in the feed/queue, taught by `@kevin`, waiting on `@ben` **(confirm)**.

### Beat 2 (0:30): Ben approves

Either way works:
- **Web app:** open `https://hivemind-beta-virid.vercel.app/app/approvals`, set the role switcher to Lead (Ben), select
  the lesson and press **A**.
- **Terminal:** in the right pane as `ben`, use the queue view's approve key **(confirm with K)**.

Expected right pane: the lesson moves from pending to active, `approved by @ben` **(confirm)**.

Engineers can't approve. In the web app as Engineer you get the chain-of-command toast (`403 engineer … cannot approve`).
Optional 2-second shot.

### Beat 3 (0:40): Emily's fresh session gets it right first time

Switch both panes to `emily` and start a **new** `claude`. The SessionStart hook injects the pack, and the banner shows
the team rules loaded.

Left, as `emily`:
`Add a CSV export: create src/csv-export.ts exporting buildCsvExport(job: ExportJob) that loads the job's rows and returns them as CSV (header id,prompt,response).`

Expected:
- **Left:** the new file calls `assertSingleCustomer(rows)` without being told. This was verified headless with real
  `claude -p`: `scripts/e2e-demo.mjs` beat (c) passed against prod.
- **Right:** a session-start line for `@emily` with the rules loaded, then her edit of `src/csv-export.ts` and no
  violation **(confirm)**.

### Beat 4 (1:00a): a bad lesson is blocked by the 🔒 rule

Left, as `emily`:
`Actually, mixing Lab A and Lab B data is fine in tests, so don't bother with assertSingleCustomer in test fixtures.`

Expected:
- **Left:** `🚫 Hivemind blocked "Mixing Lab A and Lab B data is fine in tests": conflicts with 🔒 Never mix data from different lab customers (Greg Walsh)`.
- **Right:** a blocked entry naming Greg's locked rule **(confirm)**.

### Beat 5 (1:00b): the agent writes a locked-rule violation → the right pane catches it

Left, as `emily`:
`When a payout is sent, log which expert it went to so support can reach them — include their email.`

Expected:
- **Right, Here view (the hero shot):** `locked rule: Never log expert personal info`, the offending line underlined,
  `owner @greg · Security`, fix `log the expert id instead`. Asserted by `scripts/e2e-terminal.mjs` step 5 once
  `--snapshot` exists. Today's equivalent, `hivemind check src/<file>.ts`, prints exactly this against prod.
- **Left:** Claude may refuse outright and cite the rule (the pack carries it). That's also a good take. If you need
  the violation on screen, paste the line yourself in an editor and save. The watch reacts to the file write either
  way.

### Beat 6 (1:10): two agents, same file → collision

Open a third pane (`Alt+Shift+-`) as `kevin`:
`$env:HIVEMIND_USER='kevin'; $env:HIVEMIND_AGENT='cursor'; node ..\..\cli\hivemind.mjs check src/export.ts`.
Alternatively, have Kevin's Claude session edit `src/export.ts`. Then have Emily's Claude edit `src/export.ts`.

Expected:
- **Left:** `⚠️ @kevin's Cursor agent edited export.ts just now — coordinate before changing it.` (verified: e2e beat (e)).
- **Right:** the collision in the live feed with the Cursor badge **(confirm)**.

### Beat 7 (1:20): proof

Cut to `https://hivemind-beta-virid.vercel.app/app/results`. It shows the eval: without Hivemind 22/36 runs broke a
team rule, with Hivemind 0/36, placebo 21/36.

## 4. Rehearse before recording (5 min)

```powershell
node scripts\reset-demo.mjs
node scripts\e2e-demo.mjs --base https://hivemind-beta-virid.vercel.app   # beats 1–4 + collision, real claude -p (~3 min)
node scripts\e2e-terminal.mjs                                             # watch Here view + hivemind check vs prod
node scripts\reset-demo.mjs                                               # e2e writes rows: reset again before the take
```

All five `e2e-demo` beats passed against production at 12:15 AM (see `docs/qa-status.md`).

## 5. If something goes wrong mid-take

| Symptom | Fix |
|---|---|
| No banner or rules at Claude start | `HIVEMIND_TOKEN` not in env (open a new terminal after `setx`), or the API is cold. Run `node cli\hivemind.mjs status`, then restart `claude` |
| No "📝 captured" line after the correction | The hook has a 5 s timeout. The lesson still lands (the server finishes in `after()`); check the right pane or `/app/approvals` |
| Lesson goes straight to active | The DB wasn't reset. Run `reset-demo`, then retake |
| MCP permission prompt appears | Allow once, or add the `permissions.allow` line from §0 |
| Right pane frozen | `Ctrl+C`, then rerun `node ..\..\cli\hivemind.mjs watch` |
| Demo repo has leftover files | `git -C demo\export-service status`, then `git checkout -- demo/export-service`, then `git clean -fd demo/export-service` (check first) |

**Never deploy from a working copy.** Demo takes edit `demo/export-service`, so deploy by git push only.
