/**
 * Games naming a school that is not on the roster, but nearly is.
 *
 * A name the roster does not hold is usually nothing to worry about — every
 * out-of-state opponent is one, and so is every non-member. The case worth
 * reporting is the *near miss*: "Ramsey" where the roster says "Ramsay". That
 * game is stored and shown, and it counts toward nobody. It is missing from
 * both schools' overall records and, if the two share a class and region,
 * from both region records — which is how a 4-0 team ends up below a 2-2 team
 * in the standings with nothing on the board to explain it.
 *
 * Nothing else notices. The duplicate scan looks at meetings that exist
 * twice; the coverage scan looks at schools missing a week, and a misspelt
 * school is not missing a week — the *roster* name is, but it reads as a bye,
 * which coverage deliberately tolerates. So this is its own check.
 *
 * The test is deliberately not the importer's 0.86 similarity cutoff on its
 * own. Similarity is a ratio, so it punishes short names for the commonest
 * mistake there is: "Ramsey" for "Ramsay" is one character in six and scores
 * 0.83, under the cutoff, while "Mountain Brooke" is one character in fifteen
 * and scores 0.93, over it. The same typo, read two different ways. So an
 * absolute edit distance decides the short names and the ratio decides the
 * long ones, and either one qualifying is enough.
 *
 * The suggestion is a guess and is presented as one. Across the real 393-team
 * roster four pairs of genuinely different schools score inside the threshold
 * — Dadeville/Daleville, Hale County/Dale County, Marion County/Madison
 * County, East Limestone/West Limestone. None can produce a false report,
 * because both halves of each pair are on the roster and a name on the roster
 * is never a candidate. But a school we do not yet carry could land near one
 * of those, so the admin panel asks which name the sheet actually used rather
 * than offering to rewrite it.
 */
import {
  hasOutOfStateSuffix,
  isNonMember,
  normalize,
  similarity,
} from "./names";
import type { Game } from "./types";

/** The fuzzy cutoff `matchTeam` uses, which carries the longer names. */
const NEAR = 0.86;

/**
 * Is this spelling close enough to be a typo rather than a different school?
 *
 * `similarity` is exported and `levenshtein` is not, so the distance is
 * recovered from the ratio — they are two readings of the same number.
 *
 * One character out is a typo at any length worth checking; two is a typo in a
 * long name and too loose in a short one, where it would start matching
 * genuinely different schools to each other. Names under five characters are
 * left to the ratio alone for the same reason.
 */
function isNearMiss(score: number, a: string, b: string): boolean {
  const span = Math.max(a.length, b.length);
  const dist = Math.round((1 - score) * span);
  if (span >= 5 && dist <= 1) return true;
  if (span >= 12 && dist <= 2) return true;
  return score >= NEAR;
}

export interface NearMiss {
  /** The spelling as stored in the games table. */
  stored: string;
  /** The roster name it almost certainly means. */
  suggested: string;
  /** 0–1; 1 would be an exact match, which by definition cannot appear here. */
  score: number;
  /** The games carrying the bad spelling. Shaped for `weekLabel`. */
  games: {
    id?: number;
    week: number;
    type: Game["type"];
    round: Game["round"];
    t1: string;
    t2: string;
  }[];
}

/**
 * Near misses between the games table and the roster.
 *
 * `roster` is every team name the site knows; `aliases` is the admin-maintained
 * alias table, since a name reachable by alias is already resolved and must
 * not be reported. Both are matched on normalized spellings.
 */
export function findNearMisses(
  games: Pick<Game, "id" | "t1" | "t2" | "week" | "type" | "round">[],
  roster: string[],
  aliases: string[] = [],
  nonMembers?: Set<string>,
): NearMiss[] {
  const known = new Set(roster.map(normalize));
  for (const a of aliases) known.add(normalize(a));

  // Every distinct unresolved spelling, with the games it appears in.
  const unresolved = new Map<string, NearMiss["games"]>();
  for (const g of games) {
    for (const side of [g.t1, g.t2]) {
      if (!side) continue;
      const n = normalize(side);
      if (!n || known.has(n)) continue;
      // Legitimately off the roster: an out-of-state opponent or a school
      // the admin has marked a non-member. Neither is a mistake.
      if (hasOutOfStateSuffix(side)) continue;
      if (isNonMember(side, nonMembers)) continue;
      const list = unresolved.get(side) ?? [];
      list.push({
        id: g.id,
        week: g.week,
        type: g.type,
        round: g.round ?? null,
        t1: g.t1,
        t2: g.t2,
      });
      unresolved.set(side, list);
    }
  }

  const out: NearMiss[] = [];
  for (const [stored, list] of unresolved) {
    const n = normalize(stored);
    let best = "";
    let score = 0;
    for (const name of roster) {
      const s = similarity(n, normalize(name));
      if (s > score) {
        score = s;
        best = name;
      }
    }
    // Too far off and it is a school we simply do not carry, which is not a
    // finding — reporting those would bury the ones that are.
    if (best && isNearMiss(score, n, normalize(best))) {
      out.push({ stored, suggested: best, score, games: list });
    }
  }

  // Closest first: the likeliest misspelling is the one worth reading.
  return out.sort((a, b) => b.score - a.score || a.stored.localeCompare(b.stored));
}
