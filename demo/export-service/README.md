# export-service (demo)

Fictional service that packages expert-labelled rows into dataset exports for lab customers (Lab A, Lab B).
Used as the target repo for the Hivemind demo — open Claude Code here and the team's rules are injected
at session start (see `.claude/settings.json` and `../../docs/hooks-setup.md`).

- `src/export.ts` — builds an export for a customer
- `src/logger.ts` — structured logger
- `src/db.ts` — tiny fake data access
- `migrations/` — SQL migrations
