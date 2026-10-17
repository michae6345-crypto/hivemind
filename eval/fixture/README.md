# export-service

Builds dataset exports (CSV/JSONL) for lab customers and computes payouts for the experts who annotate the data.

## Layout

- `src/exports/` – export jobs, scheduling, download links
- `src/payouts/` – expert payout calculation and sending
- `src/experts/` – expert profiles
- `src/db.ts` – tiny query helper
- `migrations/` – SQL migrations, applied in filename order

## Development

```
pnpm build
```
