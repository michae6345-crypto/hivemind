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
| Red squiggle (diagnostic) | `Breaks a locked rule: {rule title}. Locked by {Person}, {role}.` |
| Quick Fix | `Fix: {short action}` e.g. `Fix: add assertSingleCustomer(rows)` |
| Collision notification | `{Person}'s {Tool} agent edited {file} {time} ago. Check before you both change the same lines.` |
| "Teach Hivemind?" lightbulb | `Teach Hivemind: turn this fix into a lesson for #{scope}` → after: `Lesson proposed. Waiting on @{lead}.` |
| Tool names | Claude Code, Cursor, Gemini CLI, Copilot, Codex, Claude, Windsurf, VS Code |
