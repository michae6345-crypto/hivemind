# `hivemind watch`: Hivemind in the terminal

Run it in a split pane next to Claude Code, Cursor, Codex or any agent:

```
cd demo/export-service
node ../../cli/hivemind.mjs watch --user alex          # --notify for OS toasts, --no-motion, --role lead
node ../../cli/hivemind.mjs watch --once --tab queue   # print one frame and exit (CI / screenshots)
node ../../cli/hivemind.mjs statusline                 # one line for Claude Code's statusLine
```

Pure ANSI, zero deps: alternate screen, line-diffed redraws in synchronized-output brackets, raw keys, resize.
Not a TTY → one plain line per new event. `NO_COLOR` → no colour and no motion. `HIVEMIND_REDUCED_MOTION=1` → no motion.

## View contract (every view follows this)

Each view is `cli/watch/views/<id>.mjs` with a default export:

```js
export default {
  id: "queue",                 // tab id: here | rules | queue | feed  (detail is the overlay opened by actions.openDetail)
  title: "Queue",              // tab label
  count?: (state) => number|null,          // shown after the title in the tab bar
  keys?: (state) => [["a", "approve"], …], // footer hints while this view is active
  render(state, ctx) => string[],          // ANSI lines, already fitted to ctx.width; at most ctx.height are shown
  onKey?(key, state, ctx) => boolean,      // true = handled (the shell re-renders); false falls through to global keys
}
```

`key` = Node readline keypress `{ name, ctrl, shift, meta, sequence }` plus `ch` (the typed character).
Mouse (xterm SGR 1000+1006, on unless `--no-mouse`): click a tab to switch; click a row to select it and click it again
(or double-click) to open it; click a footer key hint to press it; click outside the teach box to close it; the wheel /
touchpad scrolls the current list (`view.wheelStep` rows a notch, bursts coalesced into one redraw per frame). The
wheel follows the OS natural/inverted setting; `--invert-scroll`, `HIVEMIND_INVERT_SCROLL=1` or `"invertScroll": true`
in `~/.hivemind/state.json` flips it, and `i` toggles it live. Shift + drag still selects text. Mouse mode is switched
off on every exit path (q, Ctrl+C, signals, a crash, `--snapshot` on a TTY).
Views opt into clicks with `select(i, state)` / `selected(state)` and `th.rowMark(i)` at the start of item i's first
line (a zero-width marker the shell reads for hit-testing and strips before drawing); `rowMark("back")` closes Detail.

Global keys (only if the view didn't handle them): `tab`/`shift-tab`/`←`/`→`/`1-4` switch tabs · `t` teach ·
`?` rules for the file that last changed · `esc` closes detail · `q`/`ctrl-c` quit.

`ctx = { width, height, theme, api, actions, focus, now, cfg }`

- `theme`: everything in `theme.mjs` (`P` hexes, `t.*` colour fns, `fg/bg/bold/dim/ital/curly`, `faded(alpha, fn)`,
  `ease`, `chip(kind, text)`, `scopeChip`, `handleChip`, `badge`, `label(kind[, text])`, `labelColor(kind)`, `rich`,
  `plain`, `toolName`, `TOOLS`, `HEX`, `SEP`, `sep()`) plus `fit(s, w)` (pad/clip), `clip`, `spread(left, right, w)`,
  `width`, `strip` from `term.mjs`.
- `api` (`data.mjs` `makeApi`): `scopes()`, `memories(q)`, `live()`, `rules(file)`, `check(file, text)`, `approve(id)`,
  `reject(id)`, `teach(text)`; all promises; errors carry `.status`.
- `actions`: `setTab(id)`, `openDetail(id)`, `closeDetail()`, `toast(msg, tone = "muted"|"ok"|"lesson"|"locked", ms)`,
  `celebrate(memory)`, `animate(ms)` (redraw at ~30fps for ms; use it for eases), `busy(label, fn)` (spinner after 400ms),
  `approve(memory)`, `reject(memory)` (403s become plain sentences), `refresh()`, `render()`, `pushCard(card)`,
  `plainError(e, scopeId)`.
- `focus`: false while the teach input has the keyboard.

`state`:

```
me, role, actor, workspace: { org, project, root }, repo, chain, scopes, people,
memories,            // GET /api/memories?scope=<repo>&chain=1 (every status)
live: { items, feed },  // GET /api/activity/live, polled every 2s
cards,               // feed cards from data.toCards (kind, key, at, actor, agent, line|line(now), meta, memory, born)
rules, pending, approver,  // GET /api/vscode/rules (every 15s)
flags: { [file]: Violation[] }, files: { [file]: { text, at, checking } }, lastFile,
detail, tab, online, toast, celebration, busy, teach: { focus, text },
view: { [viewId]: scratch }  // per-view state (selection index etc.)
```

## Files and owners

| File | What | Owner |
|---|---|---|
| `app.mjs` | shell: header, tabs, key routing, teach input, toasts, polling, resize | K |
| `theme.mjs` `term.mjs` `data.mjs` `frame.mjs` `notify.mjs` `index.mjs` | palette, screen, API + cards, code frame, OS toasts, entry | K |
| `views/here.mjs` `watcher.mjs` | flagged file + code frames; fs.watch → check → `state.flags`; notify wiring | J |
| `views/rules.mjs` `views/detail.mjs` `views/queue.mjs` | rules by layer, provenance timeline, role-aware queue | I |
| `views/feed.mjs` `celebrate.mjs` `statusline.mjs` | feed cards, the honey hex seal, Claude Code status line | H |

`watcher.mjs`: `startWatcher({ root, cfg, state, api, actions, hooks }) → stop()`.
`celebrate.mjs`: `celebration(memory, { now, reduced, me }) → { duration, done(now), lines(ctx, now) }`.
`statusline.mjs` / `index.mjs`: `run(argv, cfg)`. `hooks.onCard = (card) => …` fires for every new live card.
