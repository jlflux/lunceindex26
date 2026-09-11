-- Two hand-maintained boards that sit alongside the computed one.
--
-- Neither is fetched from anywhere. Every number in here is typed in by an
-- editor, which is the whole point: the sources have their own sites and their
-- own terms, and scraping them is not on the table.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Composite: our rank averaged with four outside polls.
--
-- Only the outside numbers are stored. Our own rank is read off the published
-- board at render time, so it can never drift out of step with the Index.
--
-- A team needs a number in all four columns to receive a composite — a partial
-- average would let one generous source carry a team up the board on a single
-- data point. Rows short of that still save, and simply show as incomplete.
create table if not exists composite_ranks (
  team       text primary key,
  maxpreps   integer,
  massey     integer,
  hsratings  integer,
  ahsfhs     integer,
  updated_at timestamptz not null default now()
);

alter table composite_ranks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'composite_ranks' and policyname = 'public read composite_ranks'
  ) then
    create policy "public read composite_ranks"
      on composite_ranks for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ASWA: the Alabama Sports Writers Association poll, a top ten per
-- classification voted by a panel.
--
-- `rank` null means the team is in that class's "others receiving votes" line
-- rather than the top ten, which is why it is nullable and why the primary key
-- is a surrogate: several teams share the null rank inside one classification.
create table if not exists aswa_ranks (
  id             bigserial primary key,
  classification text    not null,
  -- 1-10 for the poll proper; null for others receiving votes.
  rank           integer,
  team           text    not null,
  wins           integer not null default 0,
  losses         integer not null default 0,
  -- Votes for first place, shown in parentheses the way a poll release does.
  first_votes    integer not null default 0,
  points         integer not null default 0,
  updated_at     timestamptz not null default now()
);

create unique index if not exists aswa_ranks_class_team
  on aswa_ranks (classification, team);

create index if not exists aswa_ranks_class_rank
  on aswa_ranks (classification, rank);

alter table aswa_ranks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'aswa_ranks' and policyname = 'public read aswa_ranks'
  ) then
    create policy "public read aswa_ranks"
      on aswa_ranks for select using (true);
  end if;
end $$;
