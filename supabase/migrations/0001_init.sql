-- Hivemind schema (applied to Supabase project wzcxaokjmzamsjbczvxa). API maps snake_case rows to camelCase contracts.
create extension if not exists pg_trgm;

create type scope_level as enum ('org','team','repo','personal');
create type mem_status as enum ('pending','active','rejected','invalid','blocked');

create table scopes (
  id text primary key,                         -- 'org', 'team/data-pipelines', 'repo/dataset-builder', 'personal/sam'
  level scope_level not null,
  name text not null,
  parent_id text references scopes(id),
  owner text                                   -- person id
);

create table people (
  id text primary key,                         -- 'maya', 'jordan', ...
  name text not null,
  role text not null check (role in ('security','lead','engineer','agent')),
  scope_id text references scopes(id),
  avatar_color text
);

create table memories (
  id uuid primary key default gen_random_uuid(),
  scope_id text not null references scopes(id),
  kind text not null check (kind in ('directive','lesson','owner','fact')),
  title text not null,
  body text not null,                          -- markdown with #scope @person [[slug]] tokens
  slug text unique,
  locked boolean not null default false,
  status mem_status not null default 'pending',
  source text not null default 'human' check (source in ('human','correction','review','agent','seed')),
  author text,
  evidence jsonb not null default '[]',        -- [{type,url,quote,actor,at}]
  alpha real not null default 1,
  beta real not null default 1,
  status_reason text,                          -- e.g. why blocked
  expires_at timestamptz,
  invalidated_by uuid references memories(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_scope_status on memories(scope_id, status);
create index memories_title_trgm on memories using gin ((title || ' ' || body) gin_trgm_ops);

create table events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('correction','review_comment','session_start','session_end','edit','approval','agent_proposal')),
  actor text,
  session_id text,
  repo text,
  payload jsonb not null default '{}',
  processed boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_session on events(session_id);

create table activity (
  id bigserial primary key,
  session_id text not null,
  actor text,
  repo text,
  file text not null,
  created_at timestamptz not null default now()
);
create index activity_file_time on activity(file, created_at desc);

create table pack_log (
  id bigserial primary key,
  session_id text not null,
  actor text,
  repo text,
  memory_ids uuid[] not null default '{}',
  tokens int not null default 0,
  corrections int not null default 0,          -- filled at session end
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
