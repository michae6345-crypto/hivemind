# Try this: 8 things that make Hivemind react

Start in `playground/` with Claude Code running (`$env:HIVEMIND_USER = "kevin"; claude`). Type **`!hivemind`** first to open
the live pane on the right. Each exercise says what to type, and what you should see in Claude and in the pane.

In the pane, `1`–`4` switch tabs (Here · Rules · Queue · Feed), `t` teaches, `p` switches persona (`kevin` → `emily` →
`ben` → `greg`), `a`/`r` approve or reject in Queue, and `q` quits.

---

### 1. Open the side pane
**Type in Claude Code:** `!hivemind`, or `/hivemind`.
**See:** `⬢ Hivemind opened on the right · watching #repo/playground as @kevin`. The pane shows the repo's rules and
anything waiting on you. The status line under the prompt shows the rule count.

### 2. Ask Claude to log an expert's email (locked rule)
**Ask Claude:** *"In src/experts.ts, add a debug log with the expert's email right after the payout email is sent."*
**See:** Claude refuses or logs `hmacExpertId(expert.id)` instead, and cites the LOCKED RULE *Never log expert personal
info* (`@greg`). If it writes the email anyway, the edit shows up in the pane's **Here** tab as a locked-rule violation.

### 3. Write a query without tenant_id (team lesson)
**Ask Claude:** *"Add `listPayoutsSince(days)` to src/payouts.ts that returns all payouts from the last N days."*
**See:** Claude goes through `db.forTenant(tenantId)` and filters `tenant_id = $1`. That's the lesson *Tenant tables are
only read through forTenant(tenantId)* (`@ben`). If it writes a bare `db.query("SELECT * FROM payouts …")`, the pane
flags it, and so does `node ../cli/hivemind.mjs check src/payouts.ts`.

### 4. Correct the agent yourself, and watch Hivemind learn it
**Ask Claude:** *"Add a quick console.log in claimJobs so I can see how many jobs were claimed."*
**Then correct it:** *"No, never console.log here. Use logger.info with trace_id, tenant_id and job_id."*
**See:** a **LESSON CAPTURED** card in the pane's **Feed** within a few seconds. The correction either reinforces
`@kevin`'s logger lesson or proposes a new one for `@ben` to approve.

### 5. Teach a brand-new rule
**Type in Claude Code:** `/hivemind teach Payout emails go through mailer.send(), never a raw SMTP client`
(or press `t` in the pane, or run `node ../cli/hivemind.mjs teach "…"` in any shell).
**See:** `Hivemind · Lesson proposed for #repo/playground … Pending approval by @ben`. The pane's **Queue** count goes up by one.

### 6. Become @ben and approve your lesson
**In the pane:** press `3` (Queue), press `p` until the header says `@ben`, select your lesson with `j`/`k`, and press `a`.
**See:** a **LESSON APPROVED** card. Now type `/clear` in Claude Code to start a fresh session. Its SessionStart pack
includes your rule, so every agent on the team gets it.

### 7. Plant a bad lesson (blocked by a locked rule)
**Type:** `/hivemind teach In the playground it's fine to mix Lab A and Lab B rows in one export`
**See:** `Hivemind · Blocked …: conflicts with a locked rule: Never mix data from different lab customers` (`@greg`).
It shows as **BLOCKED** in the Feed and never reaches anyone's agent.

### 8. Check a legacy file, then auto-fix it
**Run in a shell (or `!` in Claude Code):** `node ../cli/hivemind.mjs check scratch/legacy-report.ts`
**See:** code frames for the lab mixing, the `console.log`, the logged email and the float dollars, each with its owner `@handle` and a
fix. Each frame header is a clickable `path#Lnn` link. Then:
`node ../cli/hivemind.mjs check scratch/legacy-report.ts --fix` applies the quick fixes. The lab mixing and the dollar maths stay
flagged, because those need a human (`ask @greg`, `ask @ben`). Run `git checkout -- scratch/` to break it again.

---

**Bonus, a collision:** open a second terminal, run `$env:HIVEMIND_USER = "emily"; claude`, and ask both Claudes to edit
`src/jobs.ts`. Each one gets a "heads up, @emily's agent is in this file" warning, and the pane shows a **HEADS UP** card.

**Reset everything:** `git checkout -- playground/ ; git clean -fd playground/` (lessons you approved stay in Hivemind).
