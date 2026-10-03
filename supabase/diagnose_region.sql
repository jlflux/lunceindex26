-- One region, as the site actually computes it.
--
-- Paste this whole file into the Supabase SQL editor and run it. It prints
-- five results, in order:
--
--   1. the roster      — class/region/ban flag exactly as stored
--   2. the standings   — region record computed the way the site computes it
--   3. the games       — every completed game, marked counted or not, with why
--   4. duplicates     — the same meeting stored twice, counted twice
--   5. freshness       — whether the published board predates the scores
--
-- To look at a different region, replace the class and region number
-- throughout: search for '5A' and for "region = 4".
--
-- Why this exists: the ordering code has been verified correct — region
-- percentage, then region wins, then the association's tiebreak chain, and
-- the Index rating never enters for an eligible team. When a region comes out
-- in an order that looks wrong, the records being fed in are what to look at,
-- and they are not visible by reading the board.

-- ---------------------------------------------------------------------------
-- 1. The roster as stored
-- ---------------------------------------------------------------------------
select
  '1. roster' as report,
  name,
  classification,
  region,
  postseason_ineligible as barred,
  coalesce(postseason_note, '') as ban_reason
from public.teams
where classification = '5A' and region = 4
order by name;

-- ---------------------------------------------------------------------------
-- 2. Region records, computed exactly as src/lib/season.ts does
--
--    A game counts only when: it is a regular-season game, BOTH schools are
--    on the roster, they share a classification AND a region number, neither
--    is barred from the postseason, and the result is decided (both scores
--    present, or a forfeit recorded). Forfeits are ruled on, not played:
--    forfeit_by names the side that gave the game up.
-- ---------------------------------------------------------------------------
with roster as (
  select name, classification, region, postseason_ineligible
  from public.teams
),
region_games as (
  select
    g.id, g.week, g.t1, g.s1, g.t2, g.s2, g.forfeit_by,
    case
      when g.forfeit_by = 't1' then 't2'
      when g.forfeit_by = 't2' then 't1'
      when g.s1 > g.s2 then 't1'
      when g.s2 > g.s1 then 't2'
      else null                                   -- played and level
    end as winner
  from public.games g
  join roster a on a.name = g.t1
  join roster b on b.name = g.t2
  where g.type = 'regular'
    and a.classification = b.classification
    and a.region = b.region
    and not a.postseason_ineligible
    and not b.postseason_ineligible
    and (g.forfeit_by is not null or (g.s1 is not null and g.s2 is not null))
    and a.classification = '5A' and a.region = 4
),
tally as (
  select t.name,
    count(*) filter (
      where (rg.winner = 't1' and rg.t1 = t.name)
         or (rg.winner = 't2' and rg.t2 = t.name)
    ) as region_w,
    count(*) filter (
      where (rg.winner = 't1' and rg.t2 = t.name)
         or (rg.winner = 't2' and rg.t1 = t.name)
    ) as region_l,
    count(*) filter (
      where rg.winner is null and t.name in (rg.t1, rg.t2)
    ) as region_t
  from roster t
  left join region_games rg on t.name in (rg.t1, rg.t2)
  where t.classification = '5A' and t.region = 4
  group by t.name
),
overall as (
  select t.name,
    count(*) filter (
      where (g.forfeit_by = 't2' or (g.forfeit_by is null and g.s1 > g.s2)) and g.t1 = t.name
         or (g.forfeit_by = 't1' or (g.forfeit_by is null and g.s2 > g.s1)) and g.t2 = t.name
    ) as w,
    count(*) filter (
      where (g.forfeit_by = 't1' or (g.forfeit_by is null and g.s2 > g.s1)) and g.t1 = t.name
         or (g.forfeit_by = 't2' or (g.forfeit_by is null and g.s1 > g.s2)) and g.t2 = t.name
    ) as l
  from public.teams t
  left join public.games g
    on t.name in (g.t1, g.t2)
   and g.type = 'regular'
   and (g.forfeit_by is not null or (g.s1 is not null and g.s2 is not null))
  where t.classification = '5A' and t.region = 4
  group by t.name
)
select
  '2. standings' as report,
  row_number() over (
    order by
      case when tally.region_w + tally.region_l + tally.region_t = 0 then 0.5
           else (tally.region_w + tally.region_t / 2.0)
                / (tally.region_w + tally.region_l + tally.region_t)
      end desc,
      tally.region_w desc
  ) as computed_place,
  tally.name,
  overall.w || '-' || overall.l as overall,
  tally.region_w || '-' || tally.region_l
    || case when tally.region_t > 0 then '-' || tally.region_t else '' end as region,
  tally.region_w + tally.region_l + tally.region_t as region_games,
  round(
    case when tally.region_w + tally.region_l + tally.region_t = 0 then 0.5
         else (tally.region_w + tally.region_t / 2.0)
              / (tally.region_w + tally.region_l + tally.region_t)
    end, 3) as region_pct
from tally
join overall on overall.name = tally.name
order by computed_place;

-- ---------------------------------------------------------------------------
-- 3. Every completed game involving these schools, counted or not, and why
--
--    This is where a fixture stored twice shows up as two rows, and a result
--    put on the wrong school shows up as a game against a stranger.
-- ---------------------------------------------------------------------------
select
  '3. games' as report,
  g.week,
  g.t1, g.s1, g.t2, g.s2,
  coalesce(g.forfeit_by, '') as forfeit_by,
  case
    when g.type <> 'regular'                      then 'no — playoff game'
    when a.name is null or b.name is null         then 'no — one side is not on the roster'
    when a.classification <> b.classification     then 'no — different classification ('
                                                       || a.classification || ' v ' || b.classification || ')'
    when a.region <> b.region                     then 'no — different region ('
                                                       || a.region || ' v ' || b.region || ')'
    when a.postseason_ineligible
      or b.postseason_ineligible                  then 'no — a side is barred from the postseason'
    when g.forfeit_by is null
     and (g.s1 is null or g.s2 is null)           then 'no — not decided yet'
    else 'YES — counts toward the region record'
  end as counts
from public.games g
left join public.teams a on a.name = g.t1
left join public.teams b on b.name = g.t2
where (a.classification = '5A' and a.region = 4)
   or (b.classification = '5A' and b.region = 4)
order by g.week, g.t1;

-- ---------------------------------------------------------------------------
-- 4. Fixtures stored twice
--
--    The natural key is (t1, t2, week, type), so the same meeting entered
--    with the sides swapped slips past it and is counted twice — once as a
--    win and once as a loss.
-- ---------------------------------------------------------------------------
select
  '4. duplicates' as report,
  least(g.t1, g.t2) as team_a,
  greatest(g.t1, g.t2) as team_b,
  count(*) as rows_stored,
  string_agg(g.week || ': ' || g.t1 || ' ' || coalesce(g.s1::text, '-')
             || '-' || coalesce(g.s2::text, '-') || ' ' || g.t2, ' | ') as stored_as
from public.games g
join public.teams a on a.name = g.t1
join public.teams b on b.name = g.t2
where g.type = 'regular'
  and a.classification = '5A' and a.region = 4
  and b.classification = '5A' and b.region = 4
group by least(g.t1, g.t2), greatest(g.t1, g.t2)
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- 5. Is the published board newer than the scores?
--
--    The public site reads the snapshot, not the tables. If the newest score
--    is younger than the snapshot, the board has not been republished and
--    nothing above explains what is on screen.
-- ---------------------------------------------------------------------------
select
  '5. freshness' as report,
  (select generated from public.ratings_snapshot where id = 1) as board_published,
  (select max(updated_at) from public.games)                   as newest_game_edit,
  case
    when (select count(*) from public.ratings_snapshot where id = 1) = 0
      then 'NEVER PUBLISHED — the public site has no board to read'
    when (select generated from public.ratings_snapshot where id = 1)
       > (select max(updated_at) from public.games)
      then 'board is current — the ordering above is what the site is showing'
    else 'STALE — scores have changed since the last publish; hit Recompute & publish'
  end as verdict;
