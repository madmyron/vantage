-- ──────────────────────────────────────────────
--  Vantage v11 – initial schema
-- ──────────────────────────────────────────────

-- projects
create table if not exists projects (
  id          text primary key,
  name        text not null,
  stage       text not null,
  goal        text,
  pct         integer not null default 0,
  budget      integer not null default 0,
  spent       integer not null default 0,
  created_at  timestamptz not null default now()
);

-- pips
create table if not exists pips (
  id          text primary key,
  proj        text not null references projects(id) on delete cascade,
  num         integer,
  title       text not null,
  cat         text,
  status      text not null default 'Open',
  pri         text not null default 'Medium',
  "by"        text,
  assigned    text,
  descr       text,
  due         date,
  created     timestamptz not null default now()
);

-- team
create table if not exists team (
  id    text primary key,
  name  text not null,
  role  text,
  color text
);

-- finances (one row per project)
create table if not exists finances (
  proj_id       text primary key references projects(id) on delete cascade,
  mrr           numeric(12,2) not null default 0,
  one_time      numeric(12,2) not null default 0,
  proj_mrr      numeric(12,2) not null default 0,
  dev_cost      numeric(12,2) not null default 0,
  marketing_cost numeric(12,2) not null default 0,
  tools_cost    numeric(12,2) not null default 0
);

-- dax ai chat history
create table if not exists dax_history (
  id          bigint generated always as identity primary key,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

-- ── RLS: allow anon read/write for single-user local use ──
alter table projects   enable row level security;
alter table pips       enable row level security;
alter table team       enable row level security;
alter table finances   enable row level security;
alter table dax_history enable row level security;

create policy "anon all projects"    on projects    for all using (true) with check (true);
create policy "anon all pips"        on pips        for all using (true) with check (true);
create policy "anon all team"        on team        for all using (true) with check (true);
create policy "anon all finances"    on finances    for all using (true) with check (true);
create policy "anon all dax_history" on dax_history for all using (true) with check (true);
