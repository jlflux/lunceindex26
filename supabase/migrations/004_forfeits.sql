-- Games whose official result differs from what happened on the field.
--
-- A forfeit in Alabama is an administrative ruling, usually an eligibility
-- violation found weeks later. The association vacates the win; the football
-- still happened. Maplesville beat Isabella 48-7 and then forfeited it, and
-- both of those are true at once.
--
-- So the score columns are left exactly as played and the ruling is recorded
-- beside them. `forfeit_by` names which side of the row gave the game up:
-- 't1' is the home-listed team, 't2' the visitor, and the other side takes the
-- official win. Null is the ordinary case.
--
-- The side is stored rather than the school's name because renaming a team
-- rewrites every game row that references it, and a column holding a name
-- would have to be rewritten in step or quietly go stale. 't1'/'t2' cannot.
--
-- Every object is schema-qualified. An unqualified `games` is resolved against
-- whatever search_path the session happens to carry, and in a SQL editor that
-- is not something this file can assume — "relation games does not exist" is
-- what that looks like when it goes wrong, on a database where the table is
-- sitting there in plain sight.
--
-- Safe to run more than once.

-- Fail with something worth reading rather than a bare 42P01.
do $$
begin
  if to_regclass('public.games') is null then
    raise exception
      'public.games was not found in database "%" (current schema: %). This '
      'migration only adds a column to an existing table, so the table has to '
      'be there first. The usual cause is the SQL editor pointing at a '
      'different Supabase project than the one the site uses — check the '
      'project selector against NEXT_PUBLIC_SUPABASE_URL. If this really is a '
      'fresh project, run supabase/schema.sql first.',
      current_database(), current_schema();
  end if;
end $$;

alter table public.games add column if not exists forfeit_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'games_forfeit_by_side'
      and n.nspname = 'public'
      and t.relname = 'games'
  ) then
    alter table public.games
      add constraint games_forfeit_by_side
      check (forfeit_by is null or forfeit_by in ('t1', 't2'));
  end if;
end $$;

-- Say what happened, so a run that did nothing is distinguishable from a run
-- that did something.
do $$
declare
  n bigint;
begin
  select count(*) into n from public.games where forfeit_by is not null;
  raise notice
    'forfeit_by is present on public.games in database "%". % game(s) currently marked as forfeits.',
    current_database(), n;
end $$;
