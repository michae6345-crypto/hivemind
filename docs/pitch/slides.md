# Hivemind: slide outline (6 slides)

For the closing presentation and as stills in the video. Style follows `docs/adrian-handoff.md` §4: light `#F7F8FA`
page, two-tone Syne headlines (line 1 ink, line 2 graphite), Geist body, dark macOS windows for anything that shows
an agent. One idea per slide, at most about 25 words of body text. Speaker notes are what you say, not what's on the
slide.

---

## 1. Title

**On slide**
- Headline: "Correct one agent. / Every agent learns."
- Sub: "Hivemind: shared memory for AI coding agents, with a chain of command."
- Logo, team names, "SEP Hacks 2026". Small row: "Continual Learning · Agent Monitoring · Scale · Design".

**Say** (10 s): "We're Michael and Adrian. Hivemind takes a correction you give one AI coding agent and teaches it to
every agent on your team."

---

## 2. Problem

**On slide**
- Headline: "Every agent session / starts from zero."
- Left: a dark Terminal with the same correction typed twice, by Alex on Monday and Noor on Thursday.
- Right, one stat: "#1 developer friction: finding information. 50% lose 10+ hrs/week." Source line: Atlassian State
  of DevEx 2025.

**Say** (20 s): "Teams run several agents now, from several vendors. Each one starts every session knowing nothing
about how the team works. The rules live in review comments and corrections, so the reviewer types the same thing
again for the next person's agent. CLAUDE.md only knows what someone wrote down."

---

## 3. Demo

**On slide**
- Headline: "Correct → approve → / every agent knows."
- Full-bleed hero: the split terminal from video beat 5. Left, Claude Code refuses to mix Lab A and Lab B rows and
  cites @maya's locked rule. Right, `hivemind watch` on Here with the rose code frame. The status line
  "⬢ Hivemind · {n} rules" along the bottom. No emoji anywhere on the slide.
- Under it, three small frames: Alex's correction ("Hivemind · Lesson captured: … Waiting on @jordan.") · Jordan
  presses `a` in Queue and the hex cells fill · Noor's agent writes `assertSingleCustomer(rows)` first.
- Live demo here if time allows (two terminal splits and nothing else); otherwise play video beats 2–6.

**Say** (live, or 45 s over the frames): follow `video-script.md` beats 2–6. Point at the right pane: "Hivemind
lives next to the agent, in the terminal you already have open."

---

## 4. How it learns

**On slide**
- Headline: "Lessons, not logs."
- A five-step strip: **Correction** (from chat, `hivemind teach`, or an agent's MCP proposal) → **Lesson**, pending, with
  evidence → **Approval** by the scope's lead (`a` in `hivemind watch`, or the web app) → **Context pack** at every
  session start (locked rules first, then ranked by confidence,
  ≤6k chars) → **Confidence** up when no one corrects it, down when someone does.
- Side note in Shantell Sans with an arrow to the approval step: "agents can only propose".
- Footer: "Org → team → repo → personal scopes. Locked rules always win."

**Say** (25 s): "A correction becomes a short lesson with the quote as evidence. It stays pending until the lead who
owns that code approves it. From then on every agent gets it at startup, ranked by how often it held up. Agents can
propose lessons but never approve them, and nothing can override a locked rule. That's our answer to memory
poisoning."

**Accuracy check before presenting:** all five steps are on main (build status in `devpost.md`). The
`hivemind watch` views were working stubs at 234e8b4; if Queue isn't solid, say "approve in the web app".

---

## 5. Proof

**On slide**
- Headline: "Same agent. / Learned lessons."
- Three big numbers, left to right: **OFF 14/36** · **Placebo 15/36** · **ON 36/36** (pass, Claude Code + Sonnet 5.5).
- Under them: "Held-out tasks 3/12 → 12/12 · sign test over 12 tasks, p = 0.0078".
- Small print: "12 tasks × 3 runs per arm, one fixture, deterministic graders, no LLM judge. Dashboard history is
  synthetic; this eval is the measured result. Method: docs/eval.md".

**Say** (25 s): "We wrote twelve coding tasks, each tempting the agent to break an unwritten team rule. Without
memory, it broke the rule in 22 of 36 runs. With the learned lessons, zero. A same-size pack of unrelated lessons
didn't help, so it's the content. And lessons carried over to tasks they weren't learned from. It's a small eval: one
model, tasks we wrote. The next one runs on the live ranked pack."

---

## 6. Why now · market · ask

**On slide**
- Headline: "One memory / for every agent."
- Why now (three short lines):
  - Engineers run agents from several vendors at once.
  - MCP and hooks let one memory plug into all of them.
  - OWASP's 2026 agentic Top 10 lists memory poisoning (ASI06): shared memory needs governance.
- Landscape (one line each):
  - Copilot Memory: one repo, Copilot only, unused entries expire in 28 days.
  - Factory: Factory agents only. Cursor Team Rules: hand-written.
  - Unblocked: searches docs, doesn't learn (from ~$19/user/mo).
  - Mem0 / Zep / Letta: infrastructure, not a team product.
- Works with (all on main, wired by `hivemind init`): Claude Code, Cursor, Gemini CLI, Codex, Copilot, Windsurf,
  plus claude.ai and Claude Desktop over MCP. One terminal pane, `hivemind watch`, works next to any of them.
- Ask: "Design partners: teams running two or more coding agents. Try it on one repo."

**Say** (20 s): "Teams already pay per seat for tools that search their docs. We haven't found a product whose memory learns from
corrections and works across vendors. Each vendor's memory only helps its own agent. We want teams that run
more than one agent to try it on one repo."
