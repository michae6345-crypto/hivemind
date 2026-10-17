# Hivemind: handoff for Claude Code (Adrian's side)

Written Fri Oct 16, ~9:45 PM PT. **Deadline: Sat Oct 17, 2:00 PM PT. Feature freeze: 11:00 AM.**

> **Adrian, paste this into Claude Code to start:**
> "Read `docs/adrian-handoff.md` top to bottom. Then do section 6, step 1. Ask me about anything in section 7 before
> you decide it. Keep every change small, run `pnpm typecheck` before you say it's done, and commit after each step."

---

## 1. What Hivemind is, in three sentences

When an engineer corrects their AI coding agent ("exports must call `assertSingleCustomer()`"), Hivemind turns that
correction into a **lesson**. After a team lead **approves** it, every other engineer's agent gets the lesson at the
start of its next session, so nobody has to give the same correction twice. Security can **lock** rules, and any lesson
that contradicts a locked rule is **blocked** automatically.

That's the whole product: **correct → approve → every agent knows → bad lessons get blocked.**

## 2. The demo we're building toward (the 2-minute video)

Everything we build must show up in one of these beats. If it isn't in a beat, it's clutter.

| Time | What the judge sees | Where it happens |
|---|---|---|
| 0:00 | The problem: your agent repeats a mistake a reviewer already flagged, for a different teammate | Slide |
| 0:15 | Engineer A corrects Claude. A lesson appears as "waiting for approval". The lead approves it | Claude Code, then the web app (Approvals) |
| 0:40 | Engineer B opens a fresh Claude Code session and gets it right the first time, because the lesson was injected | Claude Code |
| 1:00 | A bad lesson ("mixing labs is fine for tests") gets **blocked** by Maya's locked rule. Two agents edit the same file, so a collision warning appears | Web app + Claude Code |
| 1:20 | Proof: the eval. Without Hivemind vs with Hivemind | Web app (Results) |
| 1:40 | "Mem0 remembers a user. Glean searches docs. Hivemind learns how your company works." | Slide |

## 3. What exists right now

### Backend (Michael's; don't edit his folders)

| Piece | Status |
|---|---|
| Lessons, scopes and people in Supabase, seeded with the fictional company "Meridian Data" | ✅ done |
| `GET /api/scopes`, `GET /api/memories`, `GET /api/entities` | ✅ done |
| `GET /api/context-pack` + `hooks/session-start.mjs` (injects lessons when Claude Code starts) | ✅ done |
| `POST /api/hooks/tool` (collision warnings when two agents edit the same file) + `GET /api/activity/live` | ✅ done |
| MCP server at `/api/mcp` with `search_memory` and `propose_memory` | ✅ done |
| `GET /api/metrics` + the **real eval** (`eval/results.json`, written up in `docs/eval.md`) | ✅ done |
| `POST /api/hooks/prompt`: a correction typed to the agent becomes a pending lesson | ❌ **not built yet**. Demo beat 0:15 needs it |
| `POST /api/memories/:id/approve` and `/reject` | ❌ **not built yet**. The UI shows an error toast in live mode until it exists |
| `POST /api/memories` (write a rule by hand) | ❌ not built |
| Vercel deploy (the real live link) | ❌ not done. Michael's Saturday-morning task |

**The real eval result** (use this in the demo, it's strong): with no memory, the agent broke the team's conventions
in **22 of 36** runs. With Hivemind: **0 of 36**. A placebo pack of the same size with unrelated lessons: **21 of 36**,
so it's the lessons that help, not just extra text. Lessons learned on one task carried over to *different* tasks:
9/12 → 0/12.

### Frontend (Adrian's): `src/components/hm/`, `src/app/(ui)/`

Three screens, all working on seed data and switching to live data automatically when the API answers:

- **Vault** (`/`, `vault.tsx`): three panes. A scope tree, a CodeMirror editor with tabs, and a "Details" inspector with a live activity feed underneath.
- **Approvals** (`/approvals`, `approvals.tsx`): a review queue on the left and a big detail view on the right. The blocked-lesson "guardrail" card lives here.
- **Learning** (`/learning`, `learning.tsx`): headline, the "hive" honeycomb, a before/after number, 3 stat tiles, a chart, the eval bars and a transfer list.
- Header (`app-shell.tsx`): logo, org name, 3 tabs, "3 agents working" avatars, Search ⌘K, Write a rule, Live/Seed status, a 3-way role switcher and an avatar.
- Also: a ⌘K palette (`palette.tsx`), a "Write a rule" drawer (`composer.tsx`), Motion animations everywhere (`motion` package).

### Brand (decided, don't re-litigate)

- **Logo:** the "tonal chain". A rose locked-rule cell on top, an amber approved lesson overlapping it, and a dashed empty cell for the next lesson (`Logo` in `bits.tsx`, files in `public/brand/`).
- **Fonts:** **Syne ExtraBold** for the wordmark and headlines (Adrian's pick). Anybody *condensed* only for big numbers. **Shantell Sans** for hand-written annotations. Code chips in mono.
- **Adrian liked:** Syne, the ripple animation, the share card, the hand-drawn arrows and #hashtag chips, the "three states" (at rest → learning → everyone knows).
- **Adrian did NOT like:** Anybody *expanded*. And the overall app (see section 4).
- Colors (PLAN.md §6): background `#0B0B0E`, accent amber `#F5A524`, lock rose `#FB7185`, team `#8B93FF`, repo `#2DD4BF`.

### Links (for humans; Claude Code can't open these)

- Logo/brand canvas: https://claude.ai/artifact/CMz5VTrEwRf8TL8v5ekQz6
- Hosted UI preview (seed data, private): https://claude.ai/artifact/Jrake9kQpq63vyLt5UH4iE
- VS Code mockups (section 5): https://claude.ai/artifact/5S7sm3hn55miXaqResYsYM. Four screens: ghost text that
  follows a lesson, a locked-rule squiggle with a one-click fix, the agent checking the hive in chat (MCP), and
  "correct once" with Approve/Reject in chat plus a collision banner

## 4. Adrian's problems, in his words, and what they mean

1. **"There is way too much going on. I don't understand anything."** The UI shows every feature at once. Every
   screen has three to six things competing for attention: confidence bars, provenance sentences, backlinks, chips,
   avatars, live feeds, stat tiles, badges. A judge gets about 10 seconds per screen. **Each screen should answer
   exactly one question** (section 6, step 1).
2. **"The preview is horrible."** Same root cause. Fix by cutting, not by adding polish.
3. **"How will this look integrated into VS Code as an MCP?"** Engineers live in their editor, not in our web app.
   We need to show Hivemind where they work (section 5).
4. **"It should be like GitHub Copilot, filling stuff in, but for our product."** Ghost-text suggestions that
   already follow the team's lessons, and inline warnings when code breaks a locked rule (section 5, layer C).
5. **No live link yet.** Vercel is Michael's step (section 6, step 4).

## 5. How Hivemind shows up in VS Code (the honest version)

There are three layers. Each one needs more work than the last.

**A. Claude Code running inside VS Code. Works today, zero new code.**
Claude Code's VS Code extension runs the same hooks and MCP server we already have. The lesson gets injected at
session start, and the collision warning shows up in the Claude panel. **Record the demo here instead of a bare
terminal** and it immediately reads as "integrated into VS Code."

**B. MCP inside VS Code chat (Copilot agent mode or Claude Code). Mostly works today.**
Add Hivemind as an MCP server in `.vscode/mcp.json`, and the chat agent can call `search_memory` and
`propose_memory`. Tool calls show up as collapsible steps in chat. There's a newer spec, **MCP Apps**, that lets a
tool return a small HTML card rendered *inside the chat* (a sandboxed iframe, chat panel only). Ideas for that card:
- "3 team rules apply to `export.ts`", listing the rules as chips: 🔒 *Never mix lab data*, *Use logger*, *Cents as integers*.
- After a correction: "Lesson proposed: *Exports call assertSingleCustomer()*. Waiting on @jordan", plus an
  **Approve** button that only shows for the lead.

**C. Copilot-style "fills it in" inside the editor. Needs a VS Code extension; MCP can't draw in the editor.**
MCP only talks to the chat agent. Ghost text, squiggles and inline labels come from the VS Code extension API
(`InlineCompletionItemProvider`, `Diagnostics`, `CodeLens`, decorations). The extension would call the same
`/api/context-pack` and `/api/activity` endpoints. Design ideas, one per demo beat:
- **Ghost text that follows the lesson:** you type `export async function writeExport(rows) {` and the grey
  suggestion already starts with `assertSingleCustomer(rows)`, with a faint label at the end of the line:
  `Hivemind · Alex's lesson`.
- **CodeLens above the function:** `🔒 1 locked rule · 2 lessons apply`. Click it to see them in a hover.
- **Red squiggle on a locked-rule violation:** code that mixes two labs' rows gets
  `Breaks 🔒 Never mix data from different lab customers (Maya, Security)`, with a Quick Fix "Add assertSingleCustomer()".
- **Collision banner:** "Noor's agent edited this file 2 min ago" at the top of the editor.
- **"Teach Hivemind?" lightbulb:** when you fix something the agent wrote, offer "Turn this into a lesson for #repo/export-service".

**Realistic by 11 AM:** A for sure. B's tool calls, yes; the MCP App card only if there's time. C as **mockups for
the video/slides** (the VS Code mockups canvas linked in section 3), not working code. Say "VS Code extension: next" in the pitch.

## 6. The plan, in order

### Step 1. Cut the UI down (Adrian's lane, do this first)

Rule: **one question per screen.** Show less, and make what's left bigger.

- **Header** (`app-shell.tsx`): keep the logo + wordmark, the tabs and a compact "Viewing as: Jordan (Lead) ▾"
  dropdown. **Remove:** the org name, the "N agents working" avatars, the Search button (keep ⌘K as a hidden shortcut),
  the Live/Seed status (move it to a tiny footer), the user avatar. Move "Write a rule" into the Lessons screen.
- **Rename the tabs** to what a judge understands: Vault → **Lessons**, Approvals → **Approvals**, Learning → **Results**.
- **Lessons** (`vault.tsx`): go from three panes to **two**: a simple list (grouped by Company / Team / Repo) and the
  selected lesson as a readable card: title, the rule in one sentence, the quote it came from ("Alex corrected his
  agent: …"), who gets it, and its status. **Remove:** editor tabs, the Details inspector, confidence numbers,
  backlinks and the live feed. Keep CodeMirror only in the "Write a rule" drawer.
- **Approvals** (`approvals.tsx`): one lesson at a time, big Approve / Reject (A / R keys). Detail shows only the
  title, the rule, the quote and who it applies to. **Remove:** the scope dropdown and the confidence section. Keep the
  blocked "guardrail" card exactly as is; it's the best moment in the demo.
- **Results** (`learning.tsx`): lead with the **real eval**, big: "Without Hivemind: 22 of 36 runs broke a team rule.
  With Hivemind: 0 of 36." Under it, the placebo line (21/36). Then **either** the hive or the chart, not both.
  **Remove:** the 3 stat tiles and the transfer list. (Read the eval from `GET /api/metrics` → `eval`/`evalDetail`; it
  answers even without the database. Today the store ignores it when `curve` is empty; fix that in `store.tsx`.)
- Keep the animations that explain something (approve → item leaves the queue, the blocked proposal bumping into
  the locked rule, the hive ripple). Drop any that are pure decoration.

### Step 2. Make the demo path work end to end (needs Michael)

Ask Michael for `POST /api/hooks/prompt` (correction → pending lesson) and `POST /api/memories/:id/approve|reject`.
The UI already calls these (`store.tsx` → `decide()`). Then rehearse beats 0:15–1:00 for real.

### Step 3. VS Code (section 5)

Record the Claude Code part of the demo inside VS Code (layer A). Add `.vscode/mcp.json` to `demo/export-service`
pointing at `/api/mcp` (layer B; that's Michael's demo folder, so ask him). Use the VS Code mockups for layer C.

### Step 4. Deploy (Michael)

vercel.com/new → import `michae6345-crypto/hivemind` → add the env vars from `.env.local` → deploy. The UI works on
seed data even with no env vars. Put the Vercel URL in `HIVEMIND_API_URL` and in Devpost.

## 7. Decisions for Adrian (Claude Code: ask, don't assume)

1. Hive or chart on Results? (Recommendation: the hive. It's ours and it animates on approve.)
2. Keep the ⌘K palette at all? (Recommendation: keep it hidden, don't show the button.)
3. Is the role switcher a dropdown or a 3-button toggle? (Recommendation: a dropdown; the demo switches roles twice.)
4. Do we try the MCP App chat card (section 5B) tonight, or only mock it? (Recommendation: mock it, unless steps 1–2 are done by 1 AM.)

## 8. Rules that still apply (from CLAUDE.md)

- Only edit Adrian's folders: `src/app/(ui)/`, `src/components/`, `src/mocks/`, `public/`. Michael owns `src/app/api/`,
  `src/lib/`, `src/contracts/`, `supabase/`, `hooks/`, `eval/`, `scripts/`, `demo/`.
- `package.json` dependency changes go in their own small commit, and tell Michael.
- Never put `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY` in client code. Never commit `.env.local`.
- The demo company is fictional (Meridian Data, "Lab A / Lab B"). No real customer names.
- Agents only *propose* lessons. Locked rules are never overridden.
- Before saying done: `pnpm typecheck`, `pnpm lint`, `pnpm build`. Pull before starting, commit small, push often.

## 9. File map

| What | File |
|---|---|
| All shared state, polling, approve/reject calls | `src/components/hm/store.tsx` |
| Header, tabs, role switcher | `src/components/hm/app-shell.tsx` |
| Lessons screen | `vault.tsx` → `scope-tree.tsx`, `memory-editor.tsx`, `inspector.tsx` |
| Approvals + blocked card | `approvals.tsx`, `guardrail.tsx`, `decision-buttons.tsx`, `decisions.tsx` |
| Results | `learning.tsx`, `hex.tsx` (the hive) |
| Logo, wordmark, small UI bits | `bits.tsx` |
| Fonts | `fonts.ts`, `fonts/` (local files, OFL licensed) |
| Hash-routing for the static preview build | `nav.tsx`, `preview-root.tsx` (build with `NEXT_PUBLIC_HM_PREVIEW=1 NEXT_PUBLIC_USE_MOCKS=true`, `output: "export"`, no `api/`) |
| Seed data (fictional company) | `src/mocks/data.ts` |
| Types | `src/contracts/` (Michael's; read only) |
