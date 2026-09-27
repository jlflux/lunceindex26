/**
 * Whether a game counts toward the playoff picture — which is a different
 * question from who won it.
 *
 * `result.ts` splits a game in half when a forfeit makes the scoreboard and
 * the record disagree. This is the third question of the same kind, asked of a
 * whole team rather than one game: the association bars a program from
 * championship play, and from that moment its region schedule is void for
 * everyone. The banned team finishes 0-0 in region. The teams that played it
 * take an overall win or loss and no region result. For the tie-breaking
 * procedure the game is simply not there.
 *
 * The football still happened, so the rating reads every one of those games
 * exactly as before. `src/lib/engine.ts` deliberately does not import this
 * file, the same way it deliberately reads `fieldWinner` rather than
 * `officialWinner`.
 *
 * ## Why this is one function
 *
 * The region test used to be written three times — twice in `season.ts` and
 * once in `playoffs.ts`, where four separate loops consumed it — and all three
 * copies had to agree. Adding a condition to two of them produces standings
 * that are wrong and perfectly plausible, which is the failure mode this
 * codebase is least able to catch. So there is one predicate, and everything
 * that needs to know asks it.
 */
import type { Classification, Game, RatingRow } from "./types";

/** What the region test needs to know about each team on the roster. */
export type RegionMeta = Map<
  string,
  { c: Classification; r: number; banned: boolean }
>;

/** The roster fields this module reads. */
export type EligibilityRow = Pick<
  RatingRow,
  "name" | "classification" | "region"
> & { postseason_ineligible?: boolean };

export function regionMetaOf(ratings: EligibilityRow[]): RegionMeta {
  const meta: RegionMeta = new Map();
  for (const t of ratings) {
    meta.set(t.name, {
      c: t.classification,
      r: t.region,
      banned: t.postseason_ineligible === true,
    });
  }
  return meta;
}

/**
 * Whether this school can reach the bracket at all.
 *
 * A name that is not on the roster is out-of-state, which cannot qualify
 * either — but callers that mean "is this one of ours" should test the map
 * directly rather than read a false from here as an answer to that.
 */
export function isEligible(name: string, meta: RegionMeta): boolean {
  const t = meta.get(name);
  return Boolean(t && !t.banned);
}

export function isBanned(name: string, meta: RegionMeta): boolean {
  return meta.get(name)?.banned === true;
}

/**
 * Whether a game is a region game — the association's "required" contest.
 *
 * Five conditions, and the fifth is the new one: not a playoff game, both
 * sides on the roster, same classification, same region, and **neither side
 * barred from the postseason**. One `continue` on this drops the game for both
 * teams at once, which is exactly the rule — a banned team's region schedule
 * is void from both ends, not just its own.
 *
 * Note what this deliberately does not check: whether the game was played. A
 * fixture still to come is a region fixture, and the odds simulation needs to
 * know that. Callers that only want settled games test the scores themselves.
 */
export function countsForRegion(
  g: Pick<Game, "t1" | "t2" | "type">,
  meta: RegionMeta,
): boolean {
  if (g.type === "playoff") return false;
  const a = meta.get(g.t1);
  const b = meta.get(g.t2);
  if (!a || !b) return false; // one side is out of state
  if (a.banned || b.banned) return false;
  return a.c === b.c && a.r === b.r;
}

/**
 * Whether a game should appear in the tie-breaking data at all.
 *
 * Stricter than `countsForRegion`, and not merely its negation. A game against
 * a banned team is excluded outright rather than demoted to a non-region game,
 * because "non-region" is a category the procedure actively reads: factors (k)
 * and (l) are *about* non-region opponents. Flagging the game `required:false`
 * would hand the banned team straight back to them.
 *
 * This is why the two predicates are separate. A game between two eligible
 * teams in different regions is a real non-region game and belongs in the
 * data; a game against a banned team belongs nowhere.
 */
export function countsForTiebreak(
  g: Pick<Game, "t1" | "t2" | "type">,
  meta: RegionMeta,
): boolean {
  if (g.type === "playoff") return false;
  return !isBanned(g.t1, meta) && !isBanned(g.t2, meta);
}

/**
 * Splits a region's teams into those still playing for a place and those who
 * are not.
 *
 * Order matters more than it looks. A banned team is 0-0 in region, and
 * `orderRegion` scores a team with no games at .500 — so one left in the list
 * sorts above every team with a losing record and lands mid-table, pushing a
 * real contender below the playoff line. They come out before the ordering
 * runs, which also stops factors (c) through (j) treating them as "the No. N
 * ranked team in the region".
 */
export function splitEligible<T extends { name: string }>(
  teams: T[],
  meta: RegionMeta,
): { eligible: T[]; banned: T[] } {
  const eligible: T[] = [];
  const banned: T[] = [];
  for (const t of teams) (isBanned(t.name, meta) ? banned : eligible).push(t);
  return { eligible, banned };
}
