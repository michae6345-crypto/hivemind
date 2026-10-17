# Demo: `hivemind watch` flags what an agent just wrote

One terminal window, split in two: Claude Code on the left, `hivemind watch` on the right. The agent writes a
function that mixes two lab customers' data, and the right pane flags it within about a second.

## Setup (once)

```powershell
cd demo/export-service
$env:HIVEMIND_API_URL = "https://hivemind-q17i.onrender.com"
$env:HIVEMIND_TOKEN   = "hm-dev-token"
$env:HIVEMIND_USER    = "alex"
git checkout -- src/export.ts        # start from the clean file (no violations)
```

- Terminal profile: dark, 16 pt, background `#1C1C1E` (terminal-spec.md §9).
- Split the window:
  - **Windows Terminal:** `Alt+Shift+D`.
  - **VS Code's terminal:** the split button, or `Ctrl+Shift+5`.
- Make the left pane ~62 columns and the right pane ~58.

## Run

1. **Right pane:** `node ../../cli/hivemind.mjs watch --user alex` (add `--notify` for OS toasts). It opens on Feed.
   Rules load within a second (the header shows `8 rules · 2 locked`).
2. **Left pane:** `claude`, then ask:

   > add a function that exports both labs' rows to one file for testing

   Fallback if the agent is slow on camera: paste the body of `demo/violations.ts` (everything after its first
   comment line) at the end of `src/export.ts` and save. The watcher sees a human save the same way.
3. **What pops up on the right**, about 0.6s after the file hits disk:
   - It jumps to **Here**, and the hits soft-flash in.
   - A toast: `Claude Code's edit breaks a locked rule: Never mix data from different lab customers. Locked by @greg.`
     It names the tool when the hooks' activity reports it; otherwise it starts "This edit…".
   - The view itself:

```
src/export.ts · saved by ● @alex Claude Code · just now
2 rules broken · 1 locked

▎BREAKS A LOCKED RULE · ● #org
Never mix data from different lab customers
 ╭─[src/export.ts:23:16]
22 │   const labB = await rowsForCustomer("lab-b");
23 │   const rows = [...labA, ...labB];
   │                ~~~~~~~~~~~~~~~~~~ two labs
24 │   console.log("exporting", rows.length, "rows");
 ╰─
Set by ● @greg Security · locked 7 Sep
"Never combine Lab A and Lab B data in one export, dataset,
 eval set or pipeline run. Every export must…"
f fix: add assertSingleCustomer(rows)

MISSES A TEAM LESSON · ● #org
Use logger, not console.log
 ...
```

   - In color, `[...labA, ...labB]` sits on a rose tint with a rose `~~~~`, and the lesson hit is honey.
4. **Keys on Here:**
   - `f` applies the selected fix to the file. The watcher re-checks it, and the locked hit clears.
   - `j`/`k` picks the other hit.
   - `enter` opens the rule (provenance timeline).
   - `esc` dismisses the hits until the next change.
5. A clean file shows `This file follows every team rule.` and `8 rules checked · just now`, plus the rules it follows,
   e.g. `Followed on line 14 assertSingleCustomer(rows)`.

The handles come from the live data (prod's demo people are currently @greg = Security, @ben = lead,
@kevin/@alex = engineers). The view always shows whatever the server returns.

## Beat 2: "fix it once, every agent learns it"

Same split as above, right after Beat 1, or on its own.

1. **Left (Claude Code):**

   > add a function that logs which expert we notified

   If the agent writes `console.log(user.email)`, the right pane flags it:
   `Claude Code's edit breaks a locked rule: Never log expert personal info. Locked by @greg.`
2. **You fix it by hand** in your editor and save: `console.log(user.email)` becomes `logger.info({ expertId: user.id })`.
   No command and no form; you just fix it. Pressing `f` on Here counts too.
3. **Right (watch):**
   - About 1.5s after your last keystroke, Here shows `Learning from your fix…`.
   - Then it shows the engine's answer, also as a toast and a Feed card. It's one of:
     - `Hivemind · Lesson captured from @kevin's fix in src/experts.ts:6: "…". Waiting on @ben.`
     - `Hivemind · Lesson reinforced by @kevin's fix in src/experts.ts:6: "Never log expert personal info".`
4. **The payoff:** @ben approves it on Queue, and the next agent session, in any tool, gets the lesson in its context.

What the watcher sends, so you can explain it:
- `POST /api/events { type: "fix", actor, repo, payload: { file, diff, before, after, previousAuthor: "agent:claude-code", line, url, violationRuleId? } }`
- `diff` is a one-hunk unified diff, at most 4KB. `url` is a GitHub permalink to the line. `violationRuleId` is the flag your edit cleared.
- It sends when a human edit rewrites lines an agent wrote in the last write. The hooks' `/api/activity` says who wrote a file: an agent within 6s of the write, otherwise you.
- It also sends when a flagged violation disappears after your edit.
- At most one per file every 30s. Whitespace-only and rename-only edits are skipped (`cli/watch/fixes.mjs`).

Fallback without a live agent: record the agent's write yourself, then write the file. This is what the end-to-end test
does:

```powershell
curl.exe -s -X POST "$env:HIVEMIND_API_URL/api/activity" -H "authorization: Bearer $env:HIVEMIND_TOKEN" -H "x-hm-agent: claude-code" -H "content-type: application/json" -d '{\"sessionId\":\"demo\",\"actor\":\"kevin\",\"repo\":\"repo/export-service\",\"file\":\"src/experts.ts\"}'
# now save src/experts.ts with console.log(user.email) in it, wait ~7s, then fix it by hand
```

## Without a camera (checks)

```powershell
# one frame of Here for a file (no alt screen):
node ../../cli/hivemind.mjs watch --snapshot --file src/export.ts --user alex --cols 64 --rows 46
# watch for 9s while something writes the file, then print the frame:
node ../../cli/hivemind.mjs watch --snapshot --wait 9000 --user alex --cols 64 --rows 46
```

## How it's fast

- `cli/watch/watcher.mjs` uses recursive `fs.watch` with a 500ms debounce per file. It skips node_modules, .git and
  dist, and ignores unchanged text.
- It runs the server's own deterministic detectors locally (`vendor/detectors.mjs`, generated from
  `src/app/api/vscode/check/detectors.ts` by `node cli/watch/vendor/sync.mjs`).
- `POST /api/vscode/check` then confirms with the same slug, line, columns and message.
- Measured against prod: write → flag on screen **~0.6s**; server confirmation ~1.8s.
- Re-run `vendor/sync.mjs` whenever the server's detectors change.
