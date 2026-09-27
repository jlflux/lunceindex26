-- The bracketology layer: everything about the playoff picture that a person
-- writes rather than the season decides.
--
-- One row, like `config`, holding one jsonb document. What lives in it is only
-- the hand-authored half — the bracket arrangement, the region write-ups, the
-- projected winners, the news note, the About copy. Records, seed order and
-- status are computed from the games and the ratings on every render, so they
-- are deliberately absent: a number stored here would be a second answer to a
-- question the rest of the site already answers, free to drift from it.
--
-- The bracket stores seed references — {"region": 4, "place": 2} — never team
-- names. A slot says "whoever is second in Region 4", and who that is gets
-- resolved at render time from the standings. That is what lets a re-seed flow
-- through the whole bracket without touching it, and it is why the arrangement
-- imported from the old site survives a season of results unchanged.
--
-- Every object is schema-qualified. Safe to run more than once.

create table if not exists public.bracket (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bracket enable row level security;

-- Public read, service-role write — the same shape as every other table here.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bracket'
      and policyname = 'bracket_public_read'
  ) then
    create policy bracket_public_read on public.bracket
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
    where tgname = 'bracket_touch_updated_at'
      and tgrelid = 'public.bracket'::regclass
  ) then
    create trigger bracket_touch_updated_at
      before update on public.bracket
      for each row execute function public.touch_updated_at();
  end if;
end $$;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.bracket;
  raise notice
    'public.bracket is ready in database "%". % row(s) present — the importer writes id = 1.',
    current_database(), n;
end $$;
