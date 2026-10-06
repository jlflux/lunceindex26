-- The front page: everything on it that a person writes rather than the
-- season decides.
--
-- One row, one jsonb document, the same shape as `bracket` and `config`. What
-- lives in it is the headline, the intro, the announcement banner, and the
-- groups of links — their wording, their order, and where each points.
--
-- What deliberately does NOT live in it: the top five, the team count, the
-- updated stamp. Those are read off the published ratings snapshot when the
-- page renders. A number stored here would be a second answer to a question
-- the rest of the site already answers, free to drift from it.
--
-- The page falls back to a complete built-in default when this table is
-- missing or empty, so a deployment that has not run this migration still
-- renders a front page rather than a blank one.
--
-- Every object is schema-qualified. Safe to run more than once.

create table if not exists public.home (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.home enable row level security;

-- Public read, service-role write — the same shape as every other table here.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'home'
      and policyname = 'home_public_read'
  ) then
    create policy home_public_read on public.home
      for select using (true);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'touch_updated_at' and n.nspname = 'public'
  ) and not exists (
    select 1 from pg_trigger
    where tgname = 'home_touch_updated_at'
      and tgrelid = 'public.home'::regclass
  ) then
    create trigger home_touch_updated_at
      before update on public.home
      for each row execute function public.touch_updated_at();
  end if;
end $$;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.home;
  raise notice
    'public.home is ready in database "%". % row(s) present — the admin writes id = 1.',
    current_database(), n;
end $$;
