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
-- Safe to run more than once.

alter table games add column if not exists forfeit_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_forfeit_by_side'
  ) then
    alter table games
      add constraint games_forfeit_by_side
      check (forfeit_by is null or forfeit_by in ('t1', 't2'));
  end if;
end $$;
