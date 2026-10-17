# Hivemind for VS Code

Your team's lessons and locked rules, right in the editor. Engineers correct their AI agents, leads approve the
lessons, and this extension shows them where the code is written:

| Feature | What you see |
|---|---|
| **Status bar** | `⬡ Hivemind: 10 rules, 2 waiting`. Click it for every rule, who taught it, and the dashboard |
| **CodeLens** | Top of the file and above each function: `🔒 1 locked rule · 2 team lessons apply`. Click it to see the rules with owner and where each one was learned |
| **Hover** | Hover a symbol a rule names (`assertSingleCustomer`, `console.log`, `logger`…): title, `Alex taught this on Oct 14. Applies to #org.`, and the correction it came from |
| **Squiggles + Quick Fix** | Red: `Breaks a locked rule: Never mix data from different lab customers. Locked by Maya, Security.` Yellow for team lessons. `Ctrl+.` → `Fix: add assertSingleCustomer(rows)` |
| **Ghost text** | Start a new function and the grey suggestion already follows the team's lesson, labelled `⬡ Hivemind · from Alex's lesson` |
| **Collision warning** | `Adrian's Cursor agent edited export.ts 2 min ago. Check before you both change the same lines.` Plus an amber banner on the file's top line |
| **Teach Hivemind** | Select code you fixed → lightbulb → `Teach Hivemind: turn this fix into a lesson for #repo/export-service` → `Lesson proposed. Waiting on @jordan.` |

It talks to the Hivemind server (`/api/vscode/rules`, `/api/vscode/check`, `/api/vscode/complete`, `/api/activity/live`,
`/api/events`) and sends `x-hm-agent: vscode` on every request.

## Install (no build needed)

From the repo root:

```bash
code --install-extension vscode-extension/dist/hivemind-vscode.vsix --force
code --list-extensions | grep hivemind        # → hivemind.hivemind-vscode
```

Cursor and Windsurf work too: `cursor --install-extension vscode-extension/dist/hivemind-vscode.vsix --force`.

## Configure

Open **Settings → search "hivemind"**, or add this to your user `settings.json`:

```jsonc
{
  "hivemind.apiUrl": "http://localhost:3000",   // or the Vercel URL
  "hivemind.token": "<HIVEMIND_TOKEN from .env.local>",
  "hivemind.user": "alex"                        // who you are in Hivemind: alex, noor, jordan, maya…
  // "hivemind.repo": "repo/export-service"      // default: repo/<workspace folder name>
}
```

Shortcut: if you launch `code` from a terminal where `HIVEMIND_API_URL`, `HIVEMIND_TOKEN` and `HIVEMIND_USER` are set,
the extension uses them and you can skip the settings.

**Open `demo/export-service` as the workspace folder** (`code demo/export-service`), so the repo resolves to
`repo/export-service`. If you open the whole hivemind repo instead, set `hivemind.repo` to `repo/export-service`.

Other settings: `hivemind.inlineSuggestions`, `hivemind.checkOnType`, `hivemind.collisionWarnings`,
`hivemind.shareActivity` (your saves go to `/api/activity` so other people's agents get collision warnings),
`hivemind.dashboardUrl`.

## Demo / video click path (about 40 seconds)

**Before recording**

1. Server running (`pnpm dev`), and the demo reset if you need it (`node scripts/reset-demo.mjs`).
2. For the "from **Alex's** lesson" label, approve Alex's lesson *Every export calls assertSingleCustomer()* first
   (web app → **Approvals**, as Jordan). Before that, ghost text credits Maya's locked rule instead.
3. Turn off Copilot inline suggestions for the recording (click the Copilot icon in the status bar → disable
   completions), so its ghost text doesn't compete with Hivemind's.
4. `code demo/export-service`, then open `src/export.ts`. Use a dark theme and zoom in (`Ctrl+=` twice).

**Shots**

| # | Do this | The judge sees |
|---|---|---|
| 1 | Open `src/export.ts` (counts depend on the database; these are after Alex's lesson is approved) | Status bar (bottom right): `⬡ Hivemind: 10 rules, 2 waiting`. Top of the file: `⬡ Hivemind · 🔒 1 locked rule · 2 team lessons apply to this file`. Above `buildExport`: `🔒 1 locked rule · 2 team lessons apply` |
| 2 | Click the CodeLens above `buildExport` | A list: 🔒 *Never mix data from different lab customers* (`Maya, Security`), 💡 *Use logger, not console.log* and *Every export calls assertSingleCustomer()* (`Alex's lesson`), with the correction quote under each. Pick one for its full card |
| 3 | Hover `assertSingleCustomer` inside `buildExport` | Card: *Never mix data from different lab customers*, `Maya locked this on …. Applies to #org.` |
| 4 | Go to the end of the file and type `export async function writeExport(rows: Row[]) {`, then press **Enter** | Grey ghost text `assertSingleCustomer(rows);` and a faint `⬡ Hivemind · from Alex's lesson` at the end of the line. Press **Tab** to accept |
| 5 | Below it, type `export async function dumpAll(rows: Row[]) {`, Enter, `console.log("dump", rows.length);`, Enter, `return rows;`, then **Ctrl+S**. Escape any ghost text in this shot | A red squiggle on `dumpAll`: `Breaks a locked rule: Never mix data from different lab customers. Locked by Maya, Security.` A yellow one on `console.log`: `Doesn't follow a team lesson: Use logger, not console.log. From Alex's lesson.` |
| 6 | Click into `dumpAll`, press **Ctrl+.**, pick `Fix: add assertSingleCustomer(rows)` | The line is inserted and the red squiggle disappears. Repeat on `console.log` → `Fix: use logger.info…` |
| 7 | Have another agent edit the file (e.g. Adrian's Cursor), or simulate it (below) | Within 3 seconds: `Adrian's Cursor agent edited export.ts just now. Check before you both change the same lines.` and an amber line at the top of the file |
| 8 | Select the `dumpAll` function, click the 💡 lightbulb → `Teach Hivemind: turn this fix into a lesson for #repo/export-service`, type `Debug dumps must never mix lab customers`, then press Enter | `Lesson proposed. Waiting on @jordan.` → **Open approvals** jumps to the web app |

Simulate shot 7 (another person's agent touching the file):

```bash
curl -s -X POST http://localhost:3000/api/activity \
  -H "content-type: application/json" -H "Authorization: Bearer $HIVEMIND_TOKEN" -H "x-hm-agent: cursor" \
  -d '{"sessionId":"s-adrian-cursor","actor":"adrian","repo":"repo/export-service","file":"src/export.ts"}'
```

## Troubleshooting

- **Status bar says `Hivemind: offline`**: the server isn't reachable. Check `hivemind.apiUrl` and run
  **Hivemind: Show log** from the command palette.
- **No ghost text**: it only triggers right after you open a function (`… {` + Enter), in a file that has rules.
  Press `Alt+\` to ask for a suggestion anywhere. Copilot's suggestions can take priority, so turn Copilot off for the demo.
- **No squiggles**: they run on open, on save and 1.5s after you stop typing. Run **Hivemind: Check this file against
  team rules** to force one.
- Commands (Ctrl+Shift+P → "Hivemind"): Show team rules · Open dashboard · Check this file · Teach Hivemind · Refresh · Show log.

## Build from source

```bash
cd vscode-extension
npm install
npm run typecheck
npm run package < /dev/null   # esbuild bundle + vsce → dist/hivemind-vscode.vsix (stdin closed: vsce can wait on a prompt)
node test/run.mjs http://localhost:3107   # integration test in a real VS Code against a running server (pnpm dev -p 3107)
```

`npm run icon-font` regenerates `media/hivemind.woff` (the `$(hivemind)` glyph in the status bar and CodeLens).
`media/icon.png` is Adrian's icon from `public/brand/vscode/`. Server endpoints live in `src/app/api/vscode/`; their wire
types are mirrored in `src/types.ts`.
