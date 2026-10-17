# QA: `hivemind watch` (QA1, Sat Oct 17)

Headless only. Nothing touched a real terminal window, and nothing was written to prod.
- **Snapshot sweeps:** `watch --snapshot` for 4 personas × 4 views × playground + demo/export-service at
  50×20 / 58×30 / 64×30 / 80×45 / 120×20/30, in colour (FORCE_COLOR=3) and NO_COLOR. Every frame is checked for
  visible width ≤ cols, row count = rows, stray control chars, unbalanced OSC 8, ESC under NO_COLOR,
  `undefined`/`NaN`/`[object`, and "view crashed". 288 colour + 192 NO_COLOR frames: 0 issues after fixes (one transient V8 OOM under load, not reproducible 3/3).
- **TTY harness:** watch runs in-process with a fake TTY stdin/stdout, a small VT emulator rebuilds the screen, and a
  `fetch` wrapper does offline / 401 / 500 / +3s delay. It **mocks every mutating call** (approve, reject, events,
  activity). It runs on a private copy of the repo with a private TMP (so watch's statusline state file never reaches
  a real Claude Code). Scenarios: tabs 1-4/tab, j/k/enter/esc, `?`, teach open/type/`q`-inside/cancel/send/empty, `p`
  cycle, a/r as engineer and lead (mock 403 + ok), approve spam, 300-key spam, resize storm (50×20 → 120×45 → 40×12 →
  80×30), Ctrl+C (exit 0, alt screen off, cursor on), DEC 2026 brackets balanced, keys while the first poll loads,
  `f` on a Here hit, every rule detail opened + scrolled at 50×20 (greg) and 58×30 (ben): 21 each, no overflow.
- **Not covered:** the celebration on a real approval (needs a live approve on prod), Windows Terminal itself.
- **Watcher:** no false flags on startup; `.paseo/ node_modules/ .next/ dist/ .claude/ .git/` ignored; binary `.ts`,
  CRLF (flag on the right line), a 787 KB file (checked in ~3s), 20 saves in 400 ms (→ 1 check), delete, rename.

| # | Bug | Status |
|---|-----|--------|
| 1 | `e2e-terminal` step 6 failed on main (4/5): `watch --snapshot --wait` awaited the first poll (5 prod calls, ~2s) before starting the watcher, so the e2e's write at 1.5s was missed | fixed 5004cdc: the watcher starts before the first poll |
| 2 | Here: code-frame note cut at 58–64 cols (`~~~~ persona…`), the video pane width | fixed 9f3bc77: the note goes before the `~~~~` when it doesn't fit after |
| 3 | Feed: at 50 cols the age was cut (`approved a lesson  just …`) | fixed 9f3bc77: the object is cut, the age stays |
| 4 | NO_COLOR: chips kept their bg padding (`proposed by  ● @kevin `, `contradicts  ● @greg's  locked rule`) | fixed 9f3bc77 |
| 5 | Toasts clipped to one line: the locked-rule notice lost `Locked by @greg.` at 58–64 cols, 403s lost `@ben can.` | fixed b8ab6eb: toasts wrap to 2 lines |
| 6 | Teach answer clipped in the box: `Blocked: contradicts @greg's locked rule "Never mix data…` (TRY-THIS step 7) | fixed b8ab6eb: wraps inside the box (≤3 lines) |
| 7 | Offline / 500 said `Set HIVEMIND_TOKEN and restart watch` (wrong: it recovers on its own), cut at 64 cols | fixed b8ab6eb: token wording only for 401/403/no token; otherwise `Retrying every few seconds.`; wrapped |
| 8 | `p` (persona) did nothing on Here and Feed; TRY-THIS says it works in the pane | fixed b8ab6eb: global key |
| 13 | Here: `Followed on line 4 console.log("sent", …)` under "Use logger …; never console.log". A rule's symbols include what it forbids (`console.log`, `parseFloat`, `db.query`), so the forbidden call was shown as the rule being followed. `import { logger }` also counted | fixed (this push): a symbol the rule's text bans (`never/not/no/instead of/avoid X`) never counts, a file that uses one isn't "following" the rule, import lines don't count |
| 14 | `f` (or a hand edit) that clears a flag by swapping `console.log(…)` → `logger.info(…)` sent **no** fix event: `trivial()` saw a same-shape token diff as a rename (DEMO.md says `f` counts as a fix) | fixed (this push): the rename filter only applies when no flag went away |
| 9 | Deleted file stays on Here with its old flags (`src/x.ts · 1 rule broken` after `rm`) | open, low (not in the video) → K |
| 10 | Feed: handles longer than the 11-cell chip column push the row out of alignment (`@michae6345`) | open, low; the only long handle is a real git-email user, not a persona |
| 11 | A binary `.ts` shows "This file follows every team rule." | open, cosmetic |
| 12 | `cli/watch/frame.mjs` is unused (Here has its own frame) | note for K, no change |

## Data on prod Michael should know about before recording (not code bugs)
- Feed (playground + export-service) has `● @cli  fixed coding-projects/my-first-agent/testproj/…`: a fix event
  from a pane that was rooted at `~` (the bug 0a88e7d fixed). It's the lesson's fix evidence, so it stays until
  `reset-demo` (or the lesson) clears it.
- Feed has `● @michae6345 corrected its agent`: a correction from a shell with no HIVEMIND_USER (git email fallback).
- Another QA agent's lessons are in kevin's Queue (`QA2 timing probe …`). They should be rejected or reset.
- Approvals flood NOW for a while after a reset/seed (`@ben Hivemind approved a lesson` × 16).
