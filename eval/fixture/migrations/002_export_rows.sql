create table export_rows (
  id text primary key,
  lab_customer_id text not null,
  batch_id text not null,
  prompt text not null,
  response text not null,
  rating integer,
  created_at timestamptz not null default now()
);
create index export_rows_batch on export_rows(batch_id);
