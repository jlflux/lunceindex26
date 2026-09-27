-- Teams barred from championship play.
--
-- The association bans a program from the postseason from time to time, and
-- the ban does more than keep them out of the bracket: their region schedule
-- is void. They finish 0-0 in region, and the teams that played them take an
-- overall win or loss and no region result at all. For the tie-breaking
-- procedure, a game against them is not there.
--
-- The football still happened, so the rating reads those games exactly as
-- before. This is the same split `forfeit_by` makes in 004 — one game with two
-- true answers, each consumer reading the one it needs — asked of a third
-- question: whether the game counts as a region game in the first place.
--
-- The ban applies to the whole season, not from the date of the ruling. That
-- is what "0-0 in region" means: region games already played disappear from
-- the table along with the ones still to come.
--
-- `postseason_note` is free text for why and when, shown on the team page. It
-- is documentation, not logic — nothing reads it but the renderer.
--
-- Every object is schema-qualified. An unqualified `teams` is resolved against
-- whatever search_path the session happens to carry, and in a SQL editor that
-- is not something this file can assume — "relation teams does not exist" is
-- what that looks like when it goes wrong, on a database where the table is
-- sitting there in plain sight.
--
-- Safe to run more than once.

-- Fail with something worth reading rather than a bare 42P01.
do $$
begin
  if to_regclass('public.teams') is null then
    raise exception
      'public.teams was not found in database "%" (current schema: %). This '
      'migration only adds columns to an existing table, so the table has to '
      'be there first. The usual cause is the SQL editor pointing at a '
      'different Supabase project than the one the site uses — check the '
      'project selector against NEXT_PUBLIC_SUPABASE_URL. If this really is a '
      'fresh project, run supabase/schema.sql first.',
      current_database(), current_schema();
  end if;
end $$;

alter table public.teams
  add column if not exists postseason_ineligible boolean not null default false;

alter table public.teams
  add column if not exists postseason_note text;

-- Say what happened, so a run that did nothing is distinguishable from a run
-- that did something.
do $$
declare
  n bigint;
  who text;
begin
  select count(*) into n from public.teams where postseason_ineligible;
  select string_agg(name, ', ' order by name) into who
    from public.teams where postseason_ineligible;
  raise notice
    'postseason_ineligible is present on public.teams in database "%". % team(s) currently barred%.',
    current_database(), n, coalesce(': ' || who, '');
end $$;
