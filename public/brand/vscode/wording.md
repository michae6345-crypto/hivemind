# Hivemind VS Code extension: icon and wording (from Adrian)

Matches the design canvas, boards 1–4. Plain words, sentence case. `{n}` and friends are placeholders.

## Icon
- `icon-128.png` (marketplace / extension icon) and `icon.svg`: the tonal chain on ink.
- Inline status-bar glyph: the logo paths in `src/components/hm/bits.tsx` (`CELL_LOCK`, `CELL_LESSON`, `CELL_NEXT`), or `$(hivemind)` if you ship an icon font.

## Colors on dark editor surfaces
- Lesson / Hivemind accent: `#F5A524` (honey). Locked rule and violation: `#FB7185` (rose). Muted label text: `#A1A1AA`.
- Honey marks lessons only. Use rose only for locked rules and blocks.

## Strings

| Where | Text |
|---|---|
| Status bar | `Hivemind: {rules} rules, {pending} waiting` (tooltip: `Team lessons loaded for #{scope}. Click to see them.`) |
| CodeLens above a function | `{locked} locked rule · {lessons} team lessons apply` (if no locked rule: `{lessons} team lessons apply`) |
| Ghost-text label at end of line | `Hivemind · from {Person}'s lesson` |
| Hover on a matching line | Title: the lesson title. Body: `{Person} taught this on {date}. Applies to #{scope}.` |
| Red squiggle (diagnostic) | `Breaks a locked rule: {rule title}. Locked by @{handle}, {role}. (Owners are always @handles, never full names.)` |
| Quick Fix | `Fix: {short action}` e.g. `Fix: add assertSingleCustomer(rows)` |
| Collision notification | `{Person}'s {Tool} agent edited {file} {time} ago. Check before you both change the same lines.` |
| "Teach Hivemind?" lightbulb | `Teach Hivemind: turn this fix into a lesson for #{scope}` → after: `Lesson proposed. Waiting on @{lead}.` |
| Tool names | Claude Code, Cursor, Gemini CLI, Copilot, Codex, Claude, Windsurf, VS Code |

## Editor, 17 Oct (Adrian; full spec and reasons in `editor-spec.md`, every surface drawn in `editor-mock.html`)

No emojis in the editor. Owners are always @handles. `{short}` = rule title cut at 40 characters on a word boundary, with "…".
These rows replace the older ones above where they overlap; the CodeLens is gone.

| Where | Text |
|---|---|
| Status bar | `$(hivemind) {rules} rules · {pending} waiting` (no pending: `$(hivemind) {rules} rules`; locked break in this file: `$(hivemind) breaks 1 locked rule`; offline: `$(hivemind) offline`) |
| Squiggle, locked | `Breaks a locked rule: {title}. Locked by @{handle} ({role}).` |
| Squiggle, lesson | `Doesn't follow a team lesson: {title}. From @{handle}'s lesson.` |
| End-of-line, locked broken | `Breaks locked rule · {short} · @{handle}` |
| End-of-line, lesson broken | `Team lesson · {short} · @{handle}` |
| End-of-line, line shaped by a lesson (after an agent edit) | `from @{handle}'s lesson` |
| End-of-line, line shaped by a locked rule | `locked rule · @{handle}` |
| Hover, kind label | `LOCKED RULE · #{scope}` / `TEAM LESSON · #{scope}` |
| Hover, provenance | `Learned from @{h}'s correction · {ago}` / `Set by @{h} · {title} · locked {date}` / `Written by @{h} · {ago}` |
| Hover, reach | `Approved by @{lead} · in every agent's next session · {n} agents have used it` (locked: `Reaches every agent: {tools}`) |
| Hover links | `Fix: {action}` · `Show in sidebar` · `Open in Hivemind` |
| Sidebar header | `Hivemind`, then `{workspace} / {project}` (local: `test workspace / test project`) |
| Sidebar tabs | `Here` · `All rules` · `Approvals {n}` |
| Here, caption | `In {file}, line {n}` |
| Here, empty | `No team rules apply here.` / `Rules that mention this file or its code show up here.` |
| Section heads | `LOCKED · {n}`, `ORG · {n}`, `TEAM · #{scope} · {n}`, `REPO · #{scope} · {n}`, `YOU · {n}` |
| Rule detail back link | `‹ All rules` |
| Rule detail buttons | `Show in file` · `Open in Hivemind` |
| Queue card, proposer | `Proposed by @{h}'s {Tool} agent · {ago}` |
| Queue buttons | `Approve` · `Reject` (blocked: `Dismiss`, security only); not your scope: `Waiting on @{lead}` |
| Queue, blocked | `Blocked by a locked rule` |
| Queue, empty | `Nothing waiting.` / `Every lesson has an owner's sign-off.` |
| Feed head / row | `ACTIVITY` / `@{h} · {Tool} · edited {file} · {ago}` |
| Feed, empty | `No agents working right now.` |
| Teach box | placeholder `Teach Hivemind a rule…`; after send `Lesson proposed. Waiting on @{lead}.` |
| Toast, agent breaks a locked rule | `{Tool}'s edit breaks a locked rule: {title}. Locked by @{handle}.` [`Fix it`] [`Show rule`] |
| Toast, collision | `@{h}'s {Tool} agent edited {file} {ago}. Check before you both change the same lines.` [`Show change`] |
| Toast, correction captured | `Your correction is now a lesson. Waiting on @{lead}.` |
| Toast, approved | `@{lead} approved your lesson "{title}". Every agent on #{scope} gets it next session.` [`Show rule`] |
| Celebration card (sidebar) | `@{lead} approved your lesson` / `{title}` / `Every agent on #{scope} gets it next session.` |
| Collision line on top of file | `@{h}'s {Tool} agent edited this file {ago}` |
