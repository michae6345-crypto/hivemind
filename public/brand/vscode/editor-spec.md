# Hivemind in your editor: design spec (Adrian, 17 Oct)

The answer to Michael's "need your design spec" email. The agents build this exactly.
Mock of every surface: `public/brand/vscode/editor-mock.html` (open it in a browser; the sidebar
section of its CSS is written to port straight into the webview). Strings live in `wording.md`.

The feel: Cursor-clean. Native VS Code type and spacing, one accent, colour only where it means
something, motion short and calm. If a surface can't look calm inside VS Code's limits, it shows less.

---

## 0. Pushback first (what VS Code won't let us do, and what we do instead)

1. **We can't colour diagnostic squiggles.** The theme draws them (Dark+ error red, warning yellow).
   Keep the diagnostics (they feed the Problems panel and Ctrl+.), keep their severities, and add our
   own decoration on the same range: a tinted background, a 2px gutter bar and an overview-ruler mark.
   Never draw a second wavy underline: two squiggles on one range look broken.
2. **Exact expressions: the columns are in.** `Violation.startCol/endCol` landed in 9936076. Put the
   tint and the diagnostic on exactly that range; fall back to the trimmed line only when they're absent.
3. **The celebration can't be drawn in the editor.** It plays in the sidebar (a webview), with a toast
   and the status-bar count flip. If the sidebar is closed, the toast and the flip alone are enough.
4. **Keep the QuickPick, just never open it on a click.** Clicks (status bar, hover links, toasts) open
   the sidebar. The QuickPick stays reachable from the command palette ("Hivemind: Show team rules")
   for keyboard users.
5. **Blue is chrome, never meaning.** Michael's darker blue is right for Hivemind's own controls, but
   the team chip is periwinkle (`#8B93FF`), so blue may never sit on a chip, a rule or a highlight.
   It is for the primary button, the active tab underline, focus rings and links. Meaning is only
   rose (locked), honey (lesson), and the layer dots.
6. **No emojis anywhere in the editor.** The one glyph is the Hivemind mark (`$(hivemind)` in the
   status bar, the SVG in the sidebar). Lock and layer are said in words and colour.

---

## 1. Colour, type, spacing

### Dark editor surfaces (the extension)

| Role | Hex | Used for |
|---|---|---|
| Chrome blue | `#4C6EF5` | primary button fill, active tab underline, focus ring |
| Chrome blue, text | `#7C93FA` | links and "Open in Hivemind" on dark (6.1:1 on `#1C1C1E`) |
| Locked / block | `#FB7185` | locked rows, locked-violation tint, "Blocked" |
| Locked tint | `rgba(251,113,133,.16)` | background on the offending expression |
| Lesson | `#F5A524` | lesson rows, lesson-violation tint, "from @alex's lesson" |
| Lesson tint | `rgba(245,165,36,.13)` | background on a lesson violation |
| Team dot | `#8B93FF` | `#team/...` chips |
| Repo dot | `#2DD4BF` | `#repo/...` chips |
| Org dot | `#E4E4E7` | `#org` chips |
| Personal dot | hollow ring, `#A1A1AA` | `#you` / `personal/...` chips (a ring, not a fill) |
| Text | `#E4E4E7` | |
| Muted | `#A1A1AA` | meta lines, timestamps |
| Faint | `#71717A` | section counts, empty states |
| Hairline | `rgba(255,255,255,.07)` | row dividers |

In the webview, inherit the theme for surfaces (`--vscode-sideBar-background`,
`--vscode-foreground`, `--vscode-font-family`, `--vscode-editor-font-family`) and use the hexes
above only for meaning. Light themes: swap to the site's light variants (`#E09A2B`, `#E5484D`,
`#5B5BD6`, `#0E9384`) when `body.vscode-light` is set.

### Type
- UI text: `var(--vscode-font-family)` at 13px, line-height 1.45. Meta lines 11.5px muted.
- Section labels: 11px, weight 600, uppercase, letter-spacing .06em, faint (`LOCKED · 2`).
- Code tokens, chips, handles, counts: `var(--vscode-editor-font-family)` at 11.5px.
- Wordmark "Hivemind" in the sidebar header: 13px weight 600 (UI font, not the site's display face).

### Spacing
- 4px grid. Sidebar padding 12px sides. Rows 8px vertical padding, 10px between title and meta.
- Radius: chips 999px, cards and inputs 6px, buttons 6px.

### Chips (one component, three kinds)
- **Scope chip** `#repo/export-service`: pill, 18px tall, padding 0 7px, mono 11px, text `#E4E4E7`,
  background `rgba(255,255,255,.06)`, 1px border `rgba(255,255,255,.08)`, and a 6px dot in the layer
  colour before the text (a ring for personal).
- **Handle chip** `@jordan`: same pill, but a 14px avatar circle instead of the dot: the initial in
  9px weight 700, ink text, on the person's layer colour (Maya = org `#E4E4E7`, Jordan = team
  `#8B93FF`, Alex/Noor/Adrian/Michael = repo `#2DD4BF`). Hover (sidebar only): name, title, and
  "Approves #team/data-pipelines".
- **Code token** `assertSingleCustomer()`: mono, no pill, a 1px honey underline at 55% opacity,
  2px offset. Locked-rule tokens use rose. These are the words the editor highlights, so the rule
  and the code look linked.
- In hover cards (markdown), chips are approximated with
  `<span style="color:#…;background-color:#…22;">&nbsp;#team/data-pipelines&nbsp;</span>`
  (`supportHtml = true`; VS Code allows only `color` and `background-color` on spans).

---

## 2. Surfaces

### a) Highlight + squiggle on the offending code

| | Locked rule broken | Team lesson not followed |
|---|---|---|
| Diagnostic severity | Error (theme red squiggle) | Warning (theme yellow squiggle) |
| Our decoration on the exact range | background `rgba(251,113,133,.16)`, border-radius 2px | background `rgba(245,165,36,.13)` |
| Gutter | 2px bar `#FB7185` on the affected lines | 2px bar `#F5A524` |
| Overview ruler | `#FB7185`, right lane | `#F5A524`, right lane |
| Diagnostic message | `Breaks a locked rule: {title}. Locked by @{handle} ({role}).` (what the server sends since 9936076) | `Doesn't follow a team lesson: {title}. From @{handle}'s lesson.` |

`createTextEditorDecorationType({ backgroundColor, borderRadius: "2px", overviewRulerColor,
overviewRulerLane: Right, gutterIconPath: <2x18 svg bar>, gutterIconSize: "contain" })`.
Clicking anywhere on the highlighted range shows the hover (c); "Show rule" opens the sidebar on it.

### b) End-of-line annotation

An `after` decoration, italic, 12px, margin-left 2.5em. Only on lines with a violation, and on lines
an agent just wrote that a lesson shaped (the buddy). One per line, highest priority wins (locked >
lesson > shaped-by).

| Case | Text | Colour |
|---|---|---|
| Locked rule broken | `Breaks locked rule · {short title} · @maya` | `rgba(251,113,133,.8)` |
| Lesson not followed | `Team lesson · {short title} · @alex` | `rgba(245,165,36,.75)` |
| Line shaped by a lesson (buddy, after an agent edit) | `from @alex's lesson` | `rgba(245,165,36,.6)` |
| Line shaped by a locked rule | `locked rule · @maya` | `rgba(251,113,133,.6)` |

`{short title}` is the rule title cut at 40 characters on a word boundary, with "…". The
"shaped-by" annotations appear 150ms after an agent edit lands and stay until that line is next
edited by hand. (Decorations can't fade; "fade in" is the 150ms delay.)

### c) Hover card (markdown, provenance first)

```
LOCKED RULE · ● #org                                  (11px caps, rose)
Never mix data from different lab customers           (bold)
Set by @maya · Head of Security · locked 14 Oct
───
"Lab A and Lab B rows never share a file, a test or a fixture."
───
Reaches every agent: Claude Code · Cursor · Copilot · Codex · Gemini CLI
Fix: add assertSingleCustomer(rows)  ·  Show in sidebar  ·  Open in Hivemind
```

```
TEAM LESSON · ● #repo/export-service                  (11px caps, honey)
Exports call assertSingleCustomer() before writing
Learned from @alex's correction · 3h ago
───
"No. Exports must call assertSingleCustomer() before writing anything."  (@alex, to Claude Code)
───
Approved by @jordan · in every agent's next session · 4 agents have used it
Show in sidebar  ·  Open in Hivemind
```

- Line 3 is the provenance (build it from `learnedVia`) and always reads one of: `Learned from @{h}'s correction · {ago}`,
  `Set by @{h} · {title} · locked {date}`, `Written by @{h} · {ago}`.
- The quote is the evidence verbatim, in quotes, max 2 lines. Hand-written rules show the rule body.
- "Reaches" / "have used it": from events (needs `servedTo: string[]` on `VsRule`, tool names).
  If the API doesn't have it by 10 AM, drop the line; don't fake it.
- Confidence (Wilson bound) is not shown here or anywhere in the editor tonight.
- Max 2 cards per hover, divided by `---`.

### d) Sidebar (webview, 1:1 with the mock)

Top to bottom:

1. **Header** (48px): mark + `Hivemind` on the left, a 6px status dot on the right (green
   `#4ADE80` online, faint offline, with tooltip). Second line, muted mono:
   `Meridian Data / export-service`. Locally: `test workspace / test project`.
   `org` is on the rules response since 9936076; the project is the repo without `repo/`.
2. **Tabs**, a 3-way text tab bar with a 2px chrome-blue underline on the active one:
   `Here` · `All rules` · `Approvals 2`. Default `Here`.
3. **Here**: `In export.ts, line 18` (muted), then only the rules that apply to the open file and
   cursor, each as a rule row; clicking one selects its range in the editor.
   Empty: `No team rules apply here.` / `Rules that mention this file or its code show up here.`
4. **All rules**: four collapsible layer sections, each header `LOCKED · 2`, `ORG · 1`,
   `TEAM · #team/data-pipelines · 6`, `REPO · #repo/export-service · 3`, `YOU · 1`.
   Locked rules always come first in their own section regardless of layer.
5. **Rule row** (the one row component): a 2px left rule (rose if locked, honey if lesson, none for
   facts), the title with code tokens styled, then a meta line: scope chip + handle chip + `3h ago`.
   Hover: background `rgba(255,255,255,.04)`. Selected: `rgba(76,110,245,.14)` with no left-rule
   change.
6. **Rule detail** (click a row): slides in from the right over the list (180ms, ease-out), a back
   arrow `‹ All rules`. Contents, in order: the kind label (`LOCKED RULE` / `TEAM LESSON`), the
   title (15px, 600), the provenance line (as the hover), the quote block (left border 2px, muted
   italic), a facts list (`Scope`, `Approved by`, `Reaches`, `Applies here` with line links), and
   two buttons: `Show in file` (secondary) and `Open in Hivemind` (link).
7. **Approvals** (the queue by role): one card per pending lesson: the title, the quote, scope chip,
   `Proposed by @alex's Claude Code agent · 2m ago`. Leads for that scope get `Approve` (chrome-blue
   fill) and `Reject` (ghost). Everyone else sees one muted line instead: `Waiting on @jordan`.
   Blocked items: rose left rule, `Blocked by a locked rule` and the rule as a chip; only security
   sees `Dismiss`. Empty: `Nothing waiting.` / `Every lesson has an owner's sign-off.`
8. **Live feed** (collapsible, collapsed by default, under the tabs' content): `ACTIVITY`, max 5 rows,
   each `@alex · Claude Code · edited export.ts · 2m`, with the tool as a neutral pill. Empty:
   `No agents working right now.`
9. **Teach box**, pinned to the bottom: a 1-line textarea that grows to 4, placeholder
   `Teach Hivemind a rule…`, a scope chip button on the left (defaults to the repo; click to pick),
   and a send arrow on the right (chrome blue when there's text). After sending:
   `Lesson proposed. Waiting on @jordan.` in honey for 3s, then the box clears.

### e) Status bar

| State | Text | Extra |
|---|---|---|
| Normal | `$(hivemind) 10 rules · 2 waiting` | tooltip as now |
| No pending | `$(hivemind) 10 rules` | |
| Locked rule broken in this file | `$(hivemind) breaks 1 locked rule` | `color` rose |
| Just approved (celebration) | `$(hivemind) 11 rules` | `statusBarItem.prominentBackground` for 1.2s |
| Offline | `$(hivemind) offline` | muted |

Click opens the sidebar (not the QuickPick). Drop the word "Hivemind" from the text: the mark says it.

### f) Toasts: when, and how rare

Only four, ever. Information messages, never modal. At most one Hivemind toast per 2 minutes; extra
ones are dropped, not queued.

1. **An agent's edit breaks a locked rule** (not while you type: only after a write from an agent):
   `{Tool}'s edit breaks a locked rule: {title}. Locked by @maya.` Buttons: `Fix it`, `Show rule`.
2. **Collision**: `@adrian's Cursor agent edited export.ts 2 min ago. Check before you both change
   the same lines.` Button: `Show change`.
3. **Your correction became a lesson**: `Your correction is now a lesson. Waiting on @jordan.`
   Once per lesson. No button.
4. **Your lesson was approved** (the celebration, g).

Never toast on: file open, rules loaded, lesson-level violations (the highlight is enough), offline.

### g) "Lesson approved" celebration

- **Sidebar** (if visible): a card drops in at the top of the panel. Left: a 28px hex cell that
  stroke-draws in honey (300ms), fills (200ms), then a 1px honey ring expands and fades (500ms).
  Right: `@jordan approved your lesson` / `Exports call assertSingleCustomer()` (mono token) /
  `Every agent on #team/data-pipelines gets it next session.` The card stays 6s, then collapses.
  The rule's row in the list gets the same honey tint for 1.2s.
- **Toast**: `@jordan approved your lesson "Exports call assertSingleCustomer()". Every agent on
  #team/data-pipelines gets it next session.` Button: `Show rule`.
- **Status bar**: the count flips 10 → 11 with the prominent background for 1.2s.
- Under 1.2s of motion total, no confetti, no sound. `prefers-reduced-motion`: the cell appears
  filled, no ring.

### Collision visual (sidebar feed + editor)
- In the editor: a whole-line decoration on line 1 of the file,
  `@adrian's Cursor agent edited this file 2 min ago` in honey italic, background
  `rgba(245,165,36,.08)`. Goes away when you open the change or after 10 min.

---

## 3. Terminal / hook lines

No emojis. Live on main since cee7840 (17 Oct): plain text, no ANSI, shown to the engineer as the
hook's `systemMessage`. These are the shipped strings; `demo-script.ts` matches them word for word.

| Hook | Line |
|---|---|
| Session start | `Hivemind · Loaded 10 team rules for #repo/export-service.` |
| Lesson captured | `Hivemind · Lesson captured: "<title>". Waiting on @jordan.` |
| Lesson blocked | `Hivemind · Blocked: contradicts @maya's locked rule "Never mix data from different lab customers".` |
| Collision | `Hivemind · Heads up: @alex's Cursor agent edited src/export.ts 2 min ago.` ("just now" under a minute; full relative path) |
| Reinforced | `Hivemind · Lesson reinforced: "<title>" is already a team rule.` (someone corrects again after approval) |

The stored blocked reason in the app reads `Contradicts @maya's locked rule "Never mix data from
different lab customers".` Colour still carries the meaning where the surface allows it (honey for
captured, rose for blocked).

---

## 4. Answers to the feature-map questions

1. **Rule counts**: lock to the live DB after reset: 10 for Alex, 11 for Noor, everywhere.
2. **Chip colours**: keep both. Dark and light are the same role tuned for contrast on each surface.
3. **Personal**: its own mark, a hollow grey ring (`#A1A1AA`). Honey stays lessons-only.
4. **Celebration**: the hex seal (your pick), in the sidebar, plus the toast and the count flip.
   Quiet: under 1.2s, no confetti.
5. **Bounce/collision animation**: website first. In the app's Approvals the blocked card just
   turns rose and lands under "Stopped by a locked rule" (that's real); add the bounce there only if
   it's done before 10 AM.
6. **Eval visual**: dot grids for the video (they read in 2s); the Results page keeps the big
   numbers with the grids under them. Caption with n either way.
7. **@handles in the Terminal**: yes.
8. **Sidebar vs web Approvals in the video**: keep the browser beat (judges should see the web app).
   If the sidebar merges in time, a 1s cut of the celebration on Alex's screen right after Jordan
   presses A.
9. **`hivemind check` shot**: Devpost and the site only. The 2:00 cut has no room for it.
10. **New strings**: added to `wording.md` under "Editor, 17 Oct".
