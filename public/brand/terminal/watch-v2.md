# hivemind watch: polish v2 (Adrian, 17 Oct)

Frames: `watch-v2.html` and `shots-v2/*.png` (each at 46 and 72 columns). Source: `watch-v2.mjs`, built on the
atoms in `tui-reference.mjs`. Lift the functions (`header`, `pills`, `footer`, `row`, `box`, `keycap`, `who`, `pill`)
straight into `cli/watch`. `node public/brand/terminal/render-v2.mjs` re-renders after a change.

It builds on the 5/5 polish already on main (255122c). These are the things that still read as unfinished.

## Rules

1. **One header line, at every width.** It loses words, never wraps: drop the org, then the role, then shorten to
   `⬢ export-service`. The person chip always stays.
2. **Tabs are pills.** The active tab is a blue pill (`selBg` + `chromeText`, bold). Counts sit faint after the
   label. A honey `●` after Queue means something waits on **you**. That's the only reason to look at Queue.
3. **Dense rows in lists, rounded boxes only for things that float.** A queue item or a rule is two lines:
   `▎ title ……… [pill]` / `▎ scope · who · age`. A box around every list item costs two rows each and halves what
   fits in a split pane. Rounded boxes are for the palette, the detail view and the celebration.
4. **Status is a pill at the right edge of the title line**: `needs you` (honey, bold), `waiting` (grey),
   `live` (green), `blocked` (rose). Scanning one column answers "is this mine?".
5. **Queue order: NEEDS YOU, then WAITING ON OTHERS, then live as one folded line** (`● 4 live … l show`). Only
   the selected item opens: the quote (wrapped, never truncated), the conflict check, and its keys as keycaps.
6. **Feed has fixed columns: time · who · tool · what.** An agent with no human is a neutral `◇ agent` chip, and
   an unknown tool is a faint `—`, so the columns never break. Under 60 columns the tool column drops. A collision
   is one honey `↳ also open in @kevin` line under the edit.
7. **Keys are keycaps** (` a ` on `chipBg`, bold) with a faint label. The footer shows what fits, then `? more`
   at the right edge. It never cuts a word ("tab switc…" is gone).
8. **Empty states**: the open hex `⬡`, one bold line, one sentence saying what will show up here, one keycap.
   Centred. In a narrow pane the sentence wraps on words.
9. **Ctrl+K palette**: a rounded card with a blue border over the dimmed tab. The input line is `› appr▍`.
   Results are grouped (WAITING ON YOU, COMMANDS, RULES, PEOPLE), with keycaps right-aligned and the selected row
   in the same blue wash as the lists. Hints at the bottom: `enter run  ↑↓ move  esc close`.
10. **Celebration**: on the proposer's Here tab, a green card. The seven hex cells fill honey 90 ms apart, then:
    "Your lesson is live", `@ben approved it · just now`, who gets it, the rule, and `Rules for this repo 8 → 9`.
    Under 60 columns the text stacks under the hexes instead of beside them.
11. **The left pane after `hivemind open`** prints `⬢ Hivemind is watching →` (plus the handle and repo when they
    fit). It's short enough for a 40-column pane, so it never wraps mid-word.

## The split

Left (Claude Code) about 60%, right (watch) at least 46 columns. At 46 everything above fits without wrapping.
Below 44 columns the pills shorten to `Here R Q F` (the active one keeps its name).
