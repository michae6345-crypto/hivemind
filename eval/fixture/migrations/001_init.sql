create table experts (
  id text primary key,
  name text not null,
  email text not null,
  phone text,
  country text,
  hourly_rate integer not null
);

create table exports (
  id text primary key,
  batch_id text not null,
  format text not null,
  status text,
  requested_by text,
  created_at timestamptz not null default now()
);
