-- Append-only: never edit a migration that has run anywhere; add a new one (lesson from @ben).
create table jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  kind text not null check (kind in ('label', 'review')),
  status text not null default 'queued',
  created_at timestamptz not null default now()
);
create table payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  expert_id text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create table processed_webhooks (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
