-- ALPreps Index — schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

create table if not exists teams (
  id              bigserial primary key,
  name            text not null unique,
  slug            text not null unique,
  classification  text not null check (classification in ('A','AA','1A','2A','3A','4A','5A','6A')),
  region          int  not null check (region between 1 and 8),
  -- Carry-over rating from last season, already regressed toward class mean.
  preseason_prior double precision,
  -- Which prior-season team name the prior came from, for auditing.
  prior_source    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists teams_classification_idx on teams (classification, region);

-- Alternate names seen in AHSAA schedule PDFs, mapped to the canonical team.
create table if not exists team_aliases (
  id        bigserial primary key,
  team_id   bigint not null references teams (id) on delete cascade,
  alias     text not null unique,
  -- 'manual' when an admin resolved it, 'seed' for the shipped table.
  source    text not null default 'seed',
  created_at timestamptz not null default now()
);

create index if not exists team_aliases_team_idx on team_aliases (team_id);

create table if not exists games (
  id        bigserial primary key,
  -- Team NAMES, not ids: t2 may be an out-of-state school with no team row.
  t1        text not null,
  s1        int,
  t2        text not null,
  s2        int,
  week      int  not null default 0,
  type      text not null default 'regular' check (type in ('regular','playoff')),
  round     text check (round in ('r1','r2','r3','r4','r5')),
  date      text,
  -- Informational only. The engine NEVER reads this; score presence decides
  -- whether a game counts. See src/lib/engine.ts step 0.
  status    text default 'scheduled',
  neutral_site boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One meeting per matchup per week; makes schedule imports idempotent.
  unique (t1, t2, week, type)
);

create index if not exists games_week_idx on games (week);
create index if not exists games_t1_idx on games (t1);
create index if not exists games_t2_idx on games (t2);

-- Single-row table holding the tunable engine config.
create table if not exists config (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Cached engine output so the public site never recomputes on every request.
create table if not exists ratings_snapshot (
  id         int primary key default 1 check (id = 1),
  payload    jsonb not null,
  generated  timestamptz not null default now()
);

-- Keep updated_at honest.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists teams_touch on teams;
create trigger teams_touch before update on teams
  for each row execute function touch_updated_at();

drop trigger if exists games_touch on games;
create trigger games_touch before update on games
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: the public site reads, only the service role writes.
-- All admin mutations go through server-side API routes using the service
-- role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table teams            enable row level security;
alter table team_aliases     enable row level security;
alter table games            enable row level security;
alter table config           enable row level security;
alter table ratings_snapshot enable row level security;

drop policy if exists "public read teams"    on teams;
drop policy if exists "public read aliases"  on team_aliases;
drop policy if exists "public read games"    on games;
drop policy if exists "public read config"   on config;
drop policy if exists "public read ratings"  on ratings_snapshot;

create policy "public read teams"   on teams            for select using (true);
create policy "public read aliases" on team_aliases     for select using (true);
create policy "public read games"   on games            for select using (true);
create policy "public read config"  on config           for select using (true);
create policy "public read ratings" on ratings_snapshot for select using (true);
