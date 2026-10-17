# hivemind watch: terminal design pass (Adrian, 17 Oct)

The answer to Michael's pivot email ("a terminal-specific pass on spacing/hierarchy"). The editor spec
(`public/brand/vscode/editor-spec.md`) still holds for colours, strings and behaviour; this file says what changes
in fixed-width cells, and every value here is final unless a terminal can't do it.

- **Every screen, rendered:** `terminal-mock.html` (open it in a browser; the motion plays), PNGs in `shots/`.
- **Every screen, as code:** `tui-reference.mjs`, zero dependencies. `node public/brand/terminal/tui-reference.mjs`
  prints all of them in 24-bit colour; `here | rules | detail | queue | feed | teach | celebrate | status | split`
  prints one; `--width 44` shows the narrow layout; `celebrate --animate`, `approve --animate`, `feed --animate`
  play the motion. Lift the atoms (`scopeChip`, `handleChip`, `ruleRow`, `codeFrame`, `tabs`, `fit`, `wrap`,
  `to256`) straight into `cli/watch/`.
- `render-mock.mjs` rebuilds the HTML and the website's copy (`src/components/site/watch-screens.json`) from the
  reference, so the site, the mock and the code can't drift.

---

## 0. Tweaks to what's on main now (`hivemind watch --snapshot`, d64ee9e)

Checked against the snapshots at 64 columns. In order of what the judges will notice:

1. **Nothing in the corners.** Drop `○ offline` (header right) and `watching .` (line 2 right). A status word in a
   corner is the one thing I've asked to remove everywhere. When there's no connection, say it once in the body,
   where the content would be: `Not connected to Hivemind. Set HIVEMIND_TOKEN and restart watch.` (muted, with the
   env var in chrome blue). When connected, show nothing.
2. **One header line.** `⬢ Hivemind · Meridian Data / export-service` left, the `@alex` chip + role right. The
   second line (`0 rules · 0 locked · 0 waiting`) goes: the counts live on the tabs (`Rules 10`, `Queue 2`), which is
   also where the eye goes when they change. Under 64 columns drop the org first, then wrap who-you-are.
3. **Tabs: label row + bar row, the hint moves.** `tab switch` leaves the tab row for the footer. The active tab is
   bold `#E4E4E7` with a heavy `━` bar in `#4C6EF5` under it; the rest of the bar is a `─` hairline in `#2E2E32`.
   Under 50 columns the labels become `H R Q F`.
4. **Teach collapses until `t`.** In a split pane the always-open box costs 3 of ~30 rows and sits right next to the
   agent's own prompt, which reads as a second place to type to the agent. Idle: it isn't drawn; the footer shows
   `t teach`. On `t`: the rounded box opens at the bottom (title `Teach Hivemind` in the top border, the scope chip and
   `enter` in the bottom border), focused. After send: `Lesson proposed. Waiting on @jordan.` in honey for 3 s, then
   it closes. (If Adrian prefers it always visible, keep it to one line: `› Teach Hivemind a rule…  t`.)
5. **Repo name fallback.** Offline it shows `Hivemind / hivemind` (the folder). Use `.hivemind.json`'s repo, and if
   there's no config either, `this folder` rather than a guess.
6. **Bug:** with `NO_COLOR=1`, a truncated line ends `…\x1b[0m` (the reset survives the cut). Truncate segments, then
   serialise (`fit()` + `toAnsi()` in the reference never emit a reset when colour is off).
7. **Bug (Windows):** `--snapshot` exits with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
   src\win\async.c, line 94`. Something calls `process.exit()` while a handle is closing; let stdout drain and close
   the watchers first, or set `process.exitCode` and return.
8. **Empty states are right**; keep `No changes yet.` / `Nothing waiting.` / `No agents working right now.` with their
   second lines in faint.

---

## 1. The grid

| Width | Layout |
|---|---|
| 40–49 cols | tabs `H R Q F`; header drops the org, then who-you-are wraps; titles truncate with … |
| 50–63 cols | full tab labels; header without the org |
| **64 cols (design width)** | everything on one header line; a comfortable split pane on a 1440px screen |
| 80+ cols | same layout; extra width goes to titles and quotes, never to new columns |

Top to bottom: header (1 row) · tabs (2 rows) · body · footer (hairline + key hints, 2 rows) · teach (3 rows, only
when open). One column of left padding is fine; no right padding (the pane edge is the margin). Measure every width
by display width, never `.length` (`⬢ ● ○ ▎ ━ ─ │ ╭ ╮ ╰ ╯ ‹ › … ·` are all 1 cell; test Windows Terminal + Terminal.app).

## 2. Colour (24-bit; the 256 fallback is computed by `to256()`)

Meaning only: **blue is Hivemind's chrome, rose is locked, honey is a lesson, green is approved.** Washes are solid
colours pre-blended onto `#1C1C1E`, because a terminal has no alpha and often won't report its background.

| Role | Hex | Where |
|---|---|---|
| Text | `#E4E4E7` | titles, body |
| Muted | `#A1A1AA` | meta, provenance |
| Faint | `#71717A` | section labels, hints' words, ages (don't use SGR 2 "dim": it renders differently everywhere) |
| Hairline | `#2E2E32` | dividers, the tab bar's rest, the timeline rail |
| Chrome | `#4C6EF5` | active tab bar, selected row's `▎`, teach box border |
| Chrome text | `#91A7FF` | keys in hints, `‹ Rules`, links, env vars |
| Locked | `#E5484D` / text `#FF9592` | `▎` on locked rows, `~~~~`, `BREAKS A LOCKED RULE`, Blocked lines |
| Lesson | `#F5A524` / text `#F5C26B` | `▎` on lessons, code tokens, `TEAM LESSON`, ⬢, captured lines |
| Approved | `#3DD68C` | `Approved`, `approved it`, the timeline's approval node |
| Chip bg | `#2A2A2E` | every chip |
| Selected wash | `#232A45` | the selected row (chrome blue ~14%) |
| Approved wash | `#1D3A2B` | the approve flash |
| Layer dots | org `#E4E4E7` · team `#8B93FF` · repo `#2DD4BF` · you: hollow `○` `#A1A1AA` | inside chips only |

`NO_COLOR` or a pipe: plain text, no motion. `COLORTERM=truecolor|24bit` (or Windows Terminal, iTerm, WezTerm,
Ghostty, VS Code's terminal): 24-bit; anything else: the 256 palette.

## 3. Hierarchy without fonts

Four tools, in this order: **bold** (titles, the active tab, keys), **colour** (meaning only), **CAPS** for kind
and section labels (`LOCKED RULE`, `TEAM LESSON`, `LOCKED · 2`, `WAITING ON YOU · 2`), and **faint grey** for anything
secondary. The wordmark is `⬢` in honey + `Hivemind` bold. ⬢ is the only glyph; `●`/`○` appear only inside chips and
the timeline, `▎` only as a row's left rule.

## 4. Components (all in `tui-reference.mjs`)

- **Scope chip** `● #repo/export-service` and **handle chip** `● @jordan`: one space of chip bg each side, the dot in
  the layer colour (a person's dot is their layer: Security = org, a lead = team, an engineer = repo). Possessive goes
  inside the chip: ` ● @alex's ` (never ` ● @alex  's`). Tool names (`Claude Code`, `Cursor`) are plain faint text.
- **Rule row**: `▎ ` in rose/honey + the title in bold, code tokens underlined in the rule's colour; second line:
  scope chip, handle chip, age in faint. Selected: the whole row on `#232A45`, `▎` turns chrome blue.
- **Section label**: `TEAM · #team/data-pipelines · 2`, faint, bold, one blank row above.
- **Code frame**: `hivemind check`'s anatomy. `╭─[file:line:col]`, a `NN │` gutter, the offending line in text with
  one line of context each side in muted, then `~` under exactly `startCol..endCol` and a two-or-three-word note in
  the rule colour, then `╰─`. Notes stay short so the frame fits 64 columns.
- **Provenance**: always a line under the rule: `Set by ● @maya Security · locked 14 Oct`, or
  `Learned from ● @alex's correction · 3h ago` + `Approved by ● @jordan · in every agent's next session`.
- **Timeline** (rule detail): a `│` rail in hairline grey, `○` for events, `●` green for the approval, `●` honey for
  "now in every agent's context". Quotes are verbatim, wrapped, in text colour.
- **Queue card**: title row, the quote wrapped in muted, scope + age, `proposed by ● @alex's Claude Code agent`, then
  `a approve   r reject` for whoever can approve, or `Waiting on ● @jordan` for everyone else. Blocked lessons sit
  under `STOPPED BY A LOCKED RULE` with `Blocked: contradicts ● @maya's locked rule`.
- **Feed row**: handle chip (padded to 11 cells), tool in faint (13 cells), verb in text, object in muted, age in
  faint. Group under `NOW` and `EARLIER`. A collision adds one honey line under the two edits.
- **Footer**: a hairline, then key hints: the key bold in chrome text, the word faint, three spaces between pairs.

## 5. Screens

| Screen | PNG | Notes |
|---|---|---|
| Split (the video frame) | `shots/split.png` | Claude Code left, watch on Queue right, one window |
| Here | `shots/here.png` | locked hit first with its code frame; then lessons followed or missed |
| Rules | `shots/rules.png` | LOCKED first in its own section, then org → team → repo → you |
| Rule detail | `shots/detail.png` | replaces the hover card; `esc` back |
| Queue (lead / engineer) | `shots/queue.png`, `shots/queue-eng.png` | role-aware |
| Feed | `shots/feed.png` | |
| Teach (typing / sent) | `shots/teach.png`, `shots/teach-sent.png` | only while open |
| Celebration | `shots/celebrate.png` | on the proposer's screen |
| Narrow (44 cols) | `shots/narrow.png` | |
| Claude Code status line | `shots/status.png` | four states |

## 6. Motion (cells can't tween: step it)

- Redraw only on change, at most ~20 fps, each frame inside DEC 2026 synchronized output (`\x1b[?2026h` … `l`) so
  nothing tears. `--no-motion`, `NO_COLOR` and pipes get the final frame only.
- **Celebration** (1.6 s, held until the next key): the 7 cells of the hex flip from hairline to honey 90 ms apart,
  then `Your lesson is live` / `● @jordan approved it` / `every agent on #team/data-pipelines, next session`, and the
  rule count ticks 10 → 11 (tab and status line together). No ring, no confetti, no sound.
- **Approve** (`a`): the card's wash goes green with `Approved · in every agent's next session` for ~600 ms, then the
  card is removed and the counts tick. No slide.
- **New feed row**: arrives on the selected wash and steps back to the background over 3 frames, 100 ms apart.
- **Tabs** jump; nothing slides. No spinners anywhere (the `watching .` dots included).

## 7. Claude Code status line

`⬢ Hivemind · 10 rules · 2 waiting` (one line, muted counts). `⬢ Hivemind · breaks 1 locked rule · src/export.ts:18`
(rose, bold) when the open file breaks a locked rule; `misses 1 team lesson` (honey) for a lesson; right after an
approval, the count in honey + `lesson approved` in green until the next prompt.

## 8. Strings

The hook lines are the shipped ones (cee7840), word for word:
`Hivemind · Loaded 10 team rules for #repo/export-service.` · `Hivemind · Lesson captured: "…". Waiting on @jordan.` ·
`Hivemind · Blocked: contradicts @maya's locked rule "…".` · `Hivemind · Heads up: @alex's Cursor agent edited
src/export.ts 2 min ago.` Inside watch, the same words appear with handles as chips.

## 9. The video frame

One terminal window on the light desktop (the site's How it works scene already does this): Claude Code on the left
(~62 cols), `hivemind watch` on the right (~58 cols), a faint `│` between them. Dark profile, 16 pt, and set the
window background to `#1C1C1E` so the pre-blended washes match. `node tui-reference.mjs split` is the frame to aim for.
