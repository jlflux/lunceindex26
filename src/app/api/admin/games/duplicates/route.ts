import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { findCoverage } from "@/lib/coverage";
import { loadAliases, loadNonMembers, loadTeams } from "@/lib/data";
import { serviceClient } from "@/lib/db";
import { findDuplicates } from "@/lib/duplicates";
import { nonMemberSet } from "@/lib/names";
import { findNearMisses } from "@/lib/unmatched";
import type { Game } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Finds fixtures stored more than once.
 *
 * The unique key is (t1, t2, week, type), so re-importing the same game the
 * same way is a no-op. What it cannot catch is the same fixture recorded with
 * the sides swapped — one source calling it Homewood at John Carroll and
 * another calling it John Carroll vs Homewood are two different keys and two
 * different rows.
 *
 * Two categories, kept apart because only the first is unambiguous:
 *
 *  - "reversed": same pair, same week, opposite home/away. Nearly always one
 *    game entered twice.
 *  - "repeated": same pair, different weeks, both regular season. Usually a
 *    week mismatch between sources, but two schools genuinely can meet twice,
 *    so this is reported for judgement rather than treated as a fault.
 *
 * Playoff rematches are excluded — a regular-season meeting followed by a
 * playoff meeting is normal and not a duplicate.
 *
 * The same pass also answers the opposite question — which schools are missing
 * a week they should have played — because a name matched to the wrong school
 * shows up as both at once: a spare game on one team and a hole in another.
 *
 * And a third: a game naming a school the roster nearly holds. "Ramsey" for
 * "Ramsay" is stored, shown, and counted toward nobody — it is absent from
 * both schools' overall records and from both region records, which is enough
 * to invert a region's standings with nothing on the board to explain it.
 * Neither scan above sees it: the meeting is not duplicated, and the roster
 * name's missing week reads as a bye, which coverage tolerates on purpose.
 */
export const GET = withAdmin(async () => {
  const db = serviceClient();

  // Supabase caps a single select at 1000 rows; page through.
  const rows: Game[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from("games")
      .select("*")
      .order("id")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Game[]));
    if (!data || data.length < page) break;
  }

  const [teams, aliases, nonMembers] = await Promise.all([
    loadTeams(true),
    loadAliases(),
    loadNonMembers(),
  ]);
  const roster = teams.map((t) => t.name);

  return NextResponse.json({
    ok: true,
    ...findDuplicates(rows),
    coverage: findCoverage(rows, roster),
    // A name reachable by alias is already resolved and must not be reported.
    nearMisses: findNearMisses(
      rows,
      roster,
      Object.keys(aliases),
      nonMemberSet(nonMembers),
    ),
  });
});

/** Deletes the given game ids. */
export const DELETE = withAdmin(async (req: Request) => {
  const { ids } = (await req.json()) as { ids?: number[] };
  const list = (ids ?? []).filter((n) => Number.isInteger(n));
  if (!list.length) throw new Error("No games selected.");

  const { error } = await serviceClient().from("games").delete().in("id", list);
  if (error) throw new Error(error.message);

  return NextResponse.json({ ok: true, deleted: list.length });
});
