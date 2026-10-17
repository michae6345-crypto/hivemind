# Hivemind — instructions for Claude

Continual-learning org memory for AI coding agents. Hackathon build, deadline Sat Oct 17 2pm PT. **Full plan: PLAN.md — read it before planning work.**

## Stack
Next.js (App Router, TypeScript) + Tailwind + shadcn/ui · Supabase Postgres · @anthropic-ai/sdk (Haiku 5.5 `claude-haiku-5-5` for extract/merge/conflict, Sonnet 5.5 `claude-sonnet-5-5` if quality needs it) · CodeMirror 6 · Claude Code hooks (SessionStart = Node .mjs command; others = http hooks) · MCP via mcp-handler in a Next.js route. Package manager: pnpm. Windows machines: write scripts in Node, not bash/jq.

## Ownership (do not edit outside your owner's folders)
- **Michael:** `supabase/`, `src/contracts/`, `src/app/api/`, `src/lib/`, `hooks/`, `eval/`, `scripts/` (MCP lives in `src/app/api/mcp`)
- **Adrian:** `src/app/(ui)/`, `src/components/`, `src/mocks/`, `public/`
- `src/contracts/` and `package.json` deps change only in small dedicated commits (announce to the other person).

## Rules
- Types come from `src/contracts/` (zod). UI uses `src/mocks/` until the real API exists.
- Never expose `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY` to client code.
- Agents may only *propose* memories (status `pending`). Locked memories are never overridden.
- Demo company is fictional ("a company like AfterQuery"); use "Lab A / Lab B", never real customer names.
- Scope: build only what's in the 2-min video (PLAN.md §9). Feature freeze Sat 11:00am.

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm build`
- `node scripts/smoke-hooks.mjs` (pipe sample payloads into hooks)

## Workflow
plan → implement → verify → commit. Use subagents in `.claude/agents/`. Always run `pnpm typecheck` before saying done. Pull before starting, commit small, push often.
