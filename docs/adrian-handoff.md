# Hivemind: handoff for Claude Code (Adrian's side)

Written Fri Oct 16, ~10:15 PM PT. **Deadline: Sat Oct 17, 2:00 PM PT. Feature freeze: 11:00 AM.**

> **Adrian, paste this into Claude Code to start:**
> "Read `docs/adrian-handoff.md` top to bottom. Then do section 8 in order, one step at a time. Ask me about
> anything in section 9 before you decide it. Keep every change small, run `pnpm typecheck` before you say a step is
> done, and commit after each step."

---

## 1. What Hivemind is, in three sentences

When an engineer corrects their AI coding agent ("exports must call `assertSingleCustomer()`"), Hivemind turns that
correction into a **lesson**. After a team lead **approves** it, every other engineer's agent gets the lesson at the
start of its next session, so nobody gives the same correction twice. Security can **lock** rules, and any lesson that
contradicts a locked rule is **blocked** automatically.

The whole product: **correct → approve → every agent knows → bad lessons get blocked.**

## 2. Build from the demo backwards

**The live demo is the spec.** Every screen, animation and API route exists because a demo beat needs it. If something
isn't in a beat, don't build it. Section 6 has the beat-by-beat run sheet. Work on whichever beat is broken first.

One rule makes this practical: **write the demo script once and reuse it.** Put every line the audience will see
(typed prompts, Claude Code output, Hivemind's hook messages, notifications) in one file,
`src/components/site/demo-script.ts`. The website's animated Terminal plays that file, the rehearsal follows it, and
the video follows it. Copy Hivemind's real hook messages from Michael's code (`src/app/api/hooks/tool/route.ts`, the
context-pack header in `src/lib/`) so the website and the real thing say exactly the same words.

## 3. What exists right now

### Backend (Michael's; don't edit his folders)

| Piece | Status |
|---|---|
| Lessons, scopes and people in Supabase, seeded with the fictional company "Meridian Data" | ✅ done |
| `GET /api/scopes`, `GET /api/memories`, `GET /api/entities` | ✅ done |
| `GET /api/context-pack` + `hooks/session-start.mjs` (injects lessons when Claude Code starts) | ✅ done |
| `POST /api/hooks/tool` (collision warning when two agents edit the same file) + `GET /api/activity/live` | ✅ done |
| MCP server at `/api/mcp`: `search_memory`, `propose_memory` | ✅ done |
| `GET /api/metrics` + the **real eval** (`eval/results.json`, written up in `docs/eval.md`) | ✅ done |
| `POST /api/hooks/prompt`: a correction typed to the agent becomes a pending lesson | ❌ **not built**. Demo beat 1 needs it |
| Block a proposed lesson that contradicts a locked rule | ❌ **check with Michael**. Demo beat 4 needs it |
| `POST /api/memories/:id/approve` and `/reject` | ❌ **not built**. Demo beat 2 needs it |
| A demo reset script (put the database back to "before the demo") | 🚧 Michael's agent D is building `scripts/reset-demo.mjs` |
| A **visible** "Hivemind loaded 12 team rules" line when Claude Code starts | ❌ The hook only feeds the agent today. Ask Michael to add `systemMessage` to `hooks/session-start.mjs` (Claude Code prints `systemMessage` to the user) |
| VS Code extension | 🚧 Michael's agent H is building it in `vscode-extension/` + `src/app/api/vscode/`. **Send him boards 1–2 of the design canvas as its spec** |
| Vercel deploy (the real live link) | ❌ not done. Michael's agent D writes `docs/deploy.md` |

**The real eval result** (the proof in the demo): with no memory, the agent broke the team's conventions in
**22 of 36** runs. With Hivemind: **0 of 36**. A same-size pack of unrelated lessons: **21 of 36**, so it's the
lessons that help, not extra text. Lessons learned on one task carried over to different tasks: 9/12 → 0/12.

### Frontend (Adrian's): `src/components/hm/`, `src/app/(ui)/`

Three app screens on seed data that switch to live data when the API answers: **Vault** (`/`), **Approvals**
(`/approvals`), **Learning** (`/learning`). Plus a header, a ⌘K palette, a "Write a rule" drawer and Motion animations
(`motion` package, already installed). It's all dark and amber today. Section 4 replaces that.

### Links (for humans; Claude Code can't open these)

- **The target design (Adrian loves this one):** https://claude.ai/artifact/5S7sm3hn55miXaqResYsYM
  - Boards 1–4: Hivemind inside VS Code (ghost text, locked-rule squiggle, the agent checking the hive in chat, approve in chat).
  - **Board 5: the website hero. A light page and a macOS screen with Terminal running Claude Code + Hivemind.**
  - **Board 6: the new colors and type.**
- Logo canvas (earlier rounds): https://claude.ai/artifact/CMz5VTrEwRf8TL8v5ekQz6
- Old hosted preview (dark, too busy, being replaced): https://claude.ai/artifact/Jrake9kQpq63vyLt5UH4iE

## 4. The new look: light, calm, Space-style

Adrian: "too honey related." The new direction follows **spacefs.com**: a light off-white page, near-black and grey
text, frosted pill controls, and dark realistic macOS windows sitting on that light page. Take the *language*, not
their assets: no copying their logo, photos or copy.

### Colors (swap these into the existing CSS variables in `src/app/globals.css`)

| Variable | New value | Used for |
|---|---|---|
| `--bg` | `#F7F8FA` | Page background ("paper") |
| `--panel` | `#FFFFFF` | Cards, panels |
| `--elevated` | `#F1F3F5` | Hover rows, inputs |
| `--border` | `#E5E7EB` | Hairlines |
| `--text` | `#0E0F12` | Text, **primary buttons (black pills)** |
| `--muted` | `#686D78` | Secondary text, the second line of two-tone headlines |
| `--accent` | `#2F6FEB` | Links, focus rings, selection, the active-tab underline. **No longer honey** |
| `--chip-lock` / `--danger` | `#E5484D` | Locked rules and blocks only |
| `--ok` | `#2E9E5B` | Approved |
| new `--honey` | `#E09A2B` | **Lessons only:** hive cells, the logo, a "lesson" dot. Never buttons, never backgrounds |
| `--chip-team` / `--chip-repo` / `--chip-person` / `--chip-link` | `#5B5BD6` / `#0E9384` / `#B7791F` / `#7C5CD6` | Only as the small **dot** inside a chip |
| new `--window` | `#1C1C1E` | Terminal and editor windows (stay dark on the light page) |

Things that will break with a light theme, so fix them: `text-black` on accent buttons, `bg-black/55` overlays (use
ink at ~30%), the Sonner `Toaster theme="dark"` (make it light), the hive colors in `hex.tsx` (honey cells on white),
the chip styles `.hm-chip` in `globals.css` (neutral white pill + colored dot, mono text), and the CodeMirror theme in
`cm-tokens.ts`.

### Type

- **Syne Bold (700)** for headlines and the wordmark, written in **two tones**: first line ink, second line graphite.
  Example: "Correct one agent." / "Every agent learns." (Adrian picked Syne.)
- **Geist** for everything you read. **Geist Mono** for code and chips.
- **Shantell Sans** for hand-drawn notes with little arrows, at most one per section. Adrian likes these.
- Drop Anybody (fewer fonts) unless Adrian wants the condensed numbers back. See section 9.

### Pieces

- Buttons are **pills**: black pill = primary ("Approve", "Open the app"); frosted "glass" pill = secondary.
- Glass = `rgba(255,255,255,.72)` + `backdrop-filter: blur(12px)` + a 1px ring `rgba(14,15,18,.06)` + a soft shadow.
- Cards: white, 16px radius, hairline ring, soft shadow `0 8px 24px rgba(15,23,42,.06)`.
- Chips: white pill, hairline, a 6px colored dot, mono text: `● #repo/export-service`.

## 5. The website (new): a light landing page with a macOS Terminal hero

Board 5 on the design canvas is the target. Sections, top to bottom:

1. **Floating nav:** a round white logo button (left), a glass pill with "How it works / In your editor / Results"
   (center), a black pill "Open the app" (right). It stays pinned while you scroll.
2. **Hero:** a small glass badge "Works with Claude Code, GitHub Copilot and any MCP client", the two-tone headline
   "Correct one agent. / Every agent learns.", one sentence underneath, a black pill "Watch the 2-minute demo" and a
   glass pill "Open the app".
3. **The macOS screen (the money shot):** a rounded "desktop" with a soft blue-to-peach gradient wallpaper (no
   photos), a translucent menu bar ("Terminal Shell Edit View Window Help" … "12 rules" … the clock), a **dark
   Terminal window running Claude Code with Hivemind**, and macOS-style notifications on the right ("Jordan approved
   Alex's lesson", "Blocked a lesson from Noor's agent"). The Terminal plays `demo-script.ts`.
4. **How it works:** three steps, each with a small mock: (1) Alex corrects his agent in Terminal, (2) Jordan approves
   on a white card, (3) Noor's agent gets it right the first time. Use the "three states" hive (at rest → learning →
   everyone knows) as the visual. Adrian likes it.
5. **In your editor:** the VS Code mockups (boards 1–4) as dark windows on the light page.
6. **Locked rules:** the blocked-lesson moment: the proposal bumps into Maya's locked rule.
7. **Results:** the real eval, big: "22 of 36" → "0 of 36", the placebo line under it.
8. **Closing CTA:** "Ready to teach every agent?" + "Open the app".

### Motion: emulate Space's animations (use `motion`, already installed)

These are the effects on spacefs.com, measured from the live site. Copy the *behavior*:

- **Ambient dither waves:** a fixed full-screen `<canvas>` behind everything, drawing two slow-drifting bands of tiny
  dots on a ~7px grid. One band is blue-grey (`#4D6B99`), one honey (`#E09A2B`). Fade in over **1.8s**, drift on a
  ~60s loop. With reduced motion on, draw it once and don't animate.
- **Hero rise:** badge, headline lines, paragraph and buttons rise in one after another: `y: 12 → 0`, `opacity 0 → 1`,
  **1.1s**, easing **`cubic-bezier(0.22, 1, 0.36, 1)`**, ~80ms stagger.
- **Scroll-linked window:** as the macOS screen scrolls into view it scales **0.92 → 1** and its shadow deepens
  (`useScroll` + `useTransform`). Space does this with its Finder window.
- **The Terminal plays the demo** once it's on screen: the prompt types out with a **blinking block caret**, tool
  lines appear one by one, a pulsing "✻ Editing…" spinner runs while it "works", the diff lines fill in, the honey
  Hivemind lines fade in, then the notifications **slide in from the top right** with a spring. A **simulated mouse
  cursor** glides to "Approve" (Space moves a fake cursor around its mockups too).
- **Section reveals:** each section's title and mock fade up once, **0.7s**, same easing, when 20% in view.
- **Hovers:** 150–200ms, `cubic-bezier(0.4, 0, 0.2, 1)`. Nothing bounces on hover.
- Wrap everything in `MotionConfig reducedMotion="user"` (already done in the app shell).

## 6. The live demo run sheet (build to make this work)

**Setup (5 minutes before):**
- Mac, screen recording at 1440×900 or 1920×1080. Terminal: dark profile, **16pt font** so the video is readable.
- Two Terminal windows side by side: **left = Alex** (`export HIVEMIND_USER=alex`), **right = Noor**
  (`export HIVEMIND_USER=noor`). Both: `HIVEMIND_TOKEN` and `HIVEMIND_API_URL` set (see `docs/hooks-setup.md`),
  `cd demo/export-service`, `git checkout -- src/`.
- Browser: the Hivemind app, **viewing as Jordan (Lead)**, on Approvals.
- Reset the data: `node scripts/reset-demo.mjs` (ask Michael). The lesson "Exports call assertSingleCustomer()" must
  **not** exist yet, and neither must the bad lesson.

| # | Time | Window | You type / do | What must happen | Needs |
|---|---|---|---|---|---|
| 1 | 0:15 | Alex | `claude` → "Add a CSV export for Lab B's monthly report in src/export.ts" | A visible line: Hivemind loaded 12 rules. The agent writes the export **without** the customer check | ❌ `systemMessage` in session-start |
| 1b | 0:25 | Alex | "No. Exports must call assertSingleCustomer() before writing anything." | The hook replies: lesson captured, waiting for approval | ❌ `/api/hooks/prompt` |
| 2 | 0:32 | Browser | Watch the lesson slide into Approvals, press **A** | It leaves the queue, a toast confirms, Results' hive ripples | ❌ approve route |
| 3 | 0:40 | Noor | `claude` (fresh) → "Add a JSON export for Lab A's quarterly report in src/export.ts" | Banner: 13 rules. **First line written is `assertSingleCustomer(rows)`**. Zoom on it | ✅ once 2 works |
| 4 | 1:00 | Noor | "Just reuse Lab A's rows for the Lab B test fixtures, it's only tests" | Blocked by Maya's locked rule. In the browser it shows under "Stopped by a locked rule" with the bump animation | ❌ check with Michael |
| 5 | 1:10 | Alex, then Noor | Alex: "rename writeCsvExport to writeLabCsv". Then Noor edits the same file | Noor's agent shows "⚠ Alex's agent edited src/export.ts" | ✅ |
| 6 | 1:20 | Browser | Open Results | 22 of 36 → 0 of 36, placebo 21 of 36 | Step 2 below |

**Recording:** record each beat as its own clip (macOS ⇧⌘5) and stitch them. Also screen-record the website's
Terminal animation as **backup footage**: if a live hook is slow on stage, cut to it. It's the same script.

## 7. How Hivemind shows up in VS Code (keep for the "In your editor" section)

- **A. Claude Code inside VS Code works today**: same hooks, same MCP.
- **B. MCP in VS Code chat (Copilot or Claude Code) works today.** Tool calls show in chat. "MCP Apps" can also
  render a small Hivemind card inside the chat panel (boards 3–4).
- **C. Copilot-style "fills it in" in the editor needs a VS Code extension.** MCP can't draw in the editor. Michael's
  agent H is building one (`vscode-extension/`). Boards 1–2 are the design it should match: grey suggested code with a
  "Hivemind · from Alex's lesson" label, and a red squiggle with a one-click fix on locked-rule violations. If it isn't
  working by 11 AM, the website shows the mockups and the pitch says "VS Code extension: next".

## 8. The plan, in order

1. **New colors and type (section 4).** Swap the variables, fix the dark-only spots, switch headlines to two-tone Syne.
   Check every screen still reads well.
2. **Cut the app down: one question per screen.**
   - Header: logo + wordmark, tabs, a "Viewing as: Jordan (Lead) ▾" dropdown. Remove the org name, the "agents
     working" avatars, the Search button (keep ⌘K hidden), the Live/Seed status (tiny footer instead) and the avatar.
   - Rename the tabs Vault → **Lessons**, Learning → **Results**.
   - Lessons: two panes (a list grouped by Company / Team / Repo, then one readable card). Remove the editor tabs,
     the Details inspector, confidence numbers, backlinks and the live feed.
   - Approvals: one lesson at a time, big black-pill Approve and glass Reject (A / R). Keep the blocked "guardrail" card.
   - Results: lead with the real eval (read `eval` and `evalDetail` from `GET /api/metrics`; it answers even without
     the database. Today `store.tsx` ignores it when `curve` is empty, so fix that). Then the hive. Remove the stat
     tiles, the transfer list and the chart.
3. **The website (section 5)**, with `demo-script.ts` (section 2) driving the Terminal. Routing: make `/` the
   website and move the app under `/app` (`/app`, `/app/approvals`, `/app/results`), all inside `src/app/(ui)/`:
   `(ui)/page.tsx` = site, `(ui)/app/layout.tsx` = the app shell. Update `nav.tsx`. Grep Michael's code for links to
   `/approvals` and tell him if any exist.
4. **Make the demo run end to end (section 6)** with Michael: the prompt hook, approve/reject, blocking, the reset script.
5. **Deploy (Michael):** vercel.com/new → import `michae6345-crypto/hivemind` → env vars from `.env.local` → deploy.
   Then the Devpost live link = the website, and its "Open the app" goes to `/app`.

## 9. Decisions for Adrian (Claude Code: ask, don't assume)

1. Website at `/` and the app at `/app`? (Recommended: yes. Judges land on the story first.)
2. Drop Anybody completely? (Recommended: yes. Syne + Geist + Geist Mono + Shantell is already four.)
3. Results: hive, chart, or both? (Recommended: eval numbers + hive.)
4. Should the app itself go light too, or only the website? (Recommended: both, same tokens. One product.)
5. The MCP App chat card (VS Code layer B): build it, or mockups only? (Recommended: mockups only unless steps 1–4 are done.)

## 10. Rules that still apply (from CLAUDE.md)

- Only edit Adrian's folders: `src/app/(ui)/`, `src/components/`, `src/mocks/`, `public/`. Michael and his agents own
  `src/app/api/`, `src/lib/`, `src/contracts/`, `supabase/`, `hooks/`, `eval/`, `scripts/`, `demo/`, `integrations/`,
  `cli/`, `vscode-extension/`, `docs/pitch/`, `docs/deploy.md` (see CLAUDE.md for who does what).
- `package.json` dependency changes go in their own small commit, and tell Michael.
- Never put `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY` in client code. Never commit `.env.local`.
- The demo company is fictional (Meridian Data, "Lab A / Lab B"). No real customer names.
- Agents only *propose* lessons. Locked rules are never overridden.
- Before saying done: `pnpm typecheck`, `pnpm lint`, `pnpm build`. Pull before starting, commit small, push often.

## 11. File map

| What | File |
|---|---|
| Colors, fonts, chip styles, keyframes | `src/app/globals.css`, `src/components/hm/fonts.ts` |
| Shared state, polling, approve/reject calls | `src/components/hm/store.tsx` |
| Header, tabs, role switcher, toasts | `src/components/hm/app-shell.tsx` |
| Lessons screen | `vault.tsx` → `scope-tree.tsx`, `memory-editor.tsx`, `inspector.tsx` |
| Approvals + blocked card | `approvals.tsx`, `guardrail.tsx`, `decision-buttons.tsx`, `decisions.tsx` |
| Results | `learning.tsx`, `hex.tsx` (the hive) |
| Logo, wordmark, small bits | `bits.tsx` (the logo SVG paths are reused on the site) |
| Routing helpers (+ static preview mode) | `nav.tsx`, `preview-root.tsx` |
| Website (new) | `src/app/(ui)/page.tsx` + `src/components/site/*` (`demo-script.ts`, `terminal.tsx`, `mac-desktop.tsx`, `dither.tsx`) |
| Seed data | `src/mocks/data.ts` |
| Types | `src/contracts/` (Michael's; read only) |
