create table exports (
  job_id text primary key,
  customer_id text not null,
  row_count int not null,
  total_cents bigint not null,
  created_at timestamptz not null default now()
);
