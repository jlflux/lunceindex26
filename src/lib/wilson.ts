/**
 * The David Wilson rating, ported from the C he published.
 *
 * Wilson rated college football with this from 1994 to 2000, and the method
 * is one sentence: **a team's rating is the average of its game ratings, and
 * a game rating is the opponent's rating plus 100 for a win or minus 100 for
 * a loss.** Scores do not enter it. Neither does where the game was played.
 * Beating a good team is worth more than beating a bad one, and that is the
 * whole of the idea — but since every opponent's rating is itself the average
 * of their games, the definition is circular and has to be solved rather than
 * computed. So it is iterated until it stops moving.
 *
 * Two things in his code are not in that sentence, and both matter:
 *
 *   1. **A result that argues against you is discounted to a twentieth.** A
 *      win that would pull your rating down counts 0.05 of a game; so does a
 *      loss that would pull it up. Beating a bad team can barely hurt you and
 *      losing to a good one can barely help you. A tie always counts fully.
 *   2. **Each step moves half way.** The new rating is the average of what
 *      the games say and what the team already had, which is what stops the
 *      iteration oscillating.
 *
 * The scale is arbitrary — the whole system is unchanged if every rating
 * moves by the same amount — so at the end the average is set to zero and
 * displayed as 500. A hundred points is one win.
 *
 * Ported from rate.c (© 1994-2000 David Lee Wilson, distributed for
 * non-commercial use), via github.com/codykirkpatrick/wilson. Checked against
 * that repository's own published output: given its 2023 college season,
 * this reproduces all 764 of its ratings to the point. `npm run
 * validate:wilson` re-runs that check against a local checkout.
 */
import { isPlayed, officialWinner } from "./result";
import type { Classification, Game } from "./types";

/** A win is worth this much rating over the opponent. One game, in his units. */
export const WIN_STEP = 1;
/** What a result that argues against the team is worth. His 0.05. */
export const CONTRARY_WEIGHT = 0.05;
/** Display: 500 is the average team, 100 points is a win. */
export const SCALE = 100;
export const CENTER = 500;

/**
 * His loop checks every 500 passes and will run to 500,000. Ours is a tenth
 * the size of a college football season and settles in a few thousand, but
 * the ceiling is kept so a pathological field cannot hang a page render.
 */
const CHECK_EVERY = 100;
const MAX_ITERATIONS = 200_000;
/** Average movement per team, in his units, below which the field is settled. */
const SETTLED = 1e-7;

/**
 * Whether a postseason game counts twice.
 *
 * His code doubles everything after a `=====` line in the games file, which
 * is how he counted bowls. Off here: the AHSAA playoffs are a bracket every
 * region champion enters, not a reward handed to teams a poll liked, so there
 * is no reason for those games to speak twice.
 */
const POSTSEASON_COUNTS_TWICE = false;

/** All this needs of a team. `RatingRow` and `Team` both satisfy it. */
export interface WilsonTeam {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
}

export interface WilsonRow {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  /** On the published scale: 500 is the average team, 100 points is a win. */
  rating: number;
  /** The average rating of everyone they played, same scale. */
  opp_rating: number;
  rank: number;
  class_rank: number;
}

/**
 * Rates a field.
 *
 * Schools from outside the association are rated alongside everybody else —
 * they played these teams, so they are part of the same problem — but they
 * are not returned, and the zero point is set by the member teams alone, so
 * that 500 means the average AHSAA team rather than the average of whoever
 * happened to turn up on a non-region Friday.
 */
export interface WilsonOptions {
  /**
   * Where a team starts, in his units above the average. Zero for everybody
   * unless given. It changes nothing for a field whose teams all reach each
   * other through some chain of games — the games settle the answer — but a
   * group that plays only itself can only be placed by where it began, and
   * his code starts each division at its own level for exactly that reason.
   */
  start?: (name: string) => number;
  /** Which teams the zero point is averaged over. Members, unless told otherwise. */
  centerOn?: "members" | "all";
}

export function rankWilson(
  teams: WilsonTeam[],
  games: Game[],
  opts: WilsonOptions = {},
): WilsonRow[] {
  const index = new Map<string, number>();
  const name: string[] = [];
  const member: boolean[] = [];
  const w: number[] = [];
  const l: number[] = [];
  const t: number[] = [];
  /** Per team: the opponent and the result, one entry per game played. */
  const opp: number[][] = [];
  const res: number[][] = [];

  const slot = (n: string, isMember: boolean) => {
    let i = index.get(n);
    if (i === undefined) {
      i = name.length;
      index.set(n, i);
      name.push(n);
      member.push(isMember);
      w.push(0); l.push(0); t.push(0);
      opp.push([]); res.push([]);
    } else if (isMember) member[i] = true;
    return i;
  };
  for (const team of teams) slot(team.name, true);

  for (const g of games) {
    if (!isPlayed(g) && !g.forfeit_by) continue;
    // The ruling rather than the scoreboard, as every record-based board here
    // reads it: the association counts the forfeit.
    const winner = officialWinner(g);
    const a = slot(g.t1, false);
    const b = slot(g.t2, false);
    const ra = winner === "t1" ? 1 : winner === "t2" ? -1 : 0;

    if (ra === 1) { w[a]++; l[b]++; }
    else if (ra === -1) { l[a]++; w[b]++; }
    else { t[a]++; t[b]++; }

    const times = POSTSEASON_COUNTS_TWICE && g.type === "playoff" ? 2 : 1;
    for (let k = 0; k < times; k++) {
      opp[a].push(b); res[a].push(ra);
      opp[b].push(a); res[b].push(-ra);
    }
  }

  const n = name.length;
  let cur = new Array<number>(n);
  let nxt = new Array<number>(n);
  for (let i = 0; i < n; i++) cur[i] = opts.start?.(name[i]) ?? 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    // Every team is read from the same snapshot and written to the other
    // array, so the order the teams are held in cannot change the answer.
    for (let i = 0; i < n; i++) {
      const os = opp[i];
      const mine = cur[i];
      if (!os.length) {
        // Nothing to say about a team that has not played. It keeps whatever
        // it started with, exactly as his code leaves it.
        nxt[i] = mine;
        continue;
      }
      const rs = res[i];
      let sum = 0;
      let count = 0;
      for (let k = 0; k < os.length; k++) {
        const gameRating = cur[os[k]] + rs[k] * WIN_STEP;
        // A result that argues for a team counts; one that argues against it
        // counts a twentieth. A tie satisfies both and always counts.
        const arguesFor = gameRating > mine ? rs[k] >= 0 : rs[k] <= 0;
        const weight = arguesFor ? 1 : CONTRARY_WEIGHT;
        sum += weight * gameRating;
        count += weight;
      }
      // Half way from where the team was to where its games put it.
      nxt[i] = (sum / count + mine) / 2;
    }

    const check = iteration % CHECK_EVERY === 0;
    let moved = 0;
    if (check) for (let i = 0; i < n; i++) moved += Math.abs(nxt[i] - cur[i]);
    const swap = cur;
    cur = nxt;
    nxt = swap;
    if (check && moved / n <= SETTLED) break;
  }
  const next = cur;

  // The zero point is free, so it is chosen: the average member team.
  const members = [];
  for (let i = 0; i < n; i++)
    if (member[i] || opts.centerOn === "all") members.push(i);
  const mean =
    members.reduce((a, i) => a + next[i], 0) / (members.length || 1);

  const show = (r: number) => Math.round(SCALE * (r - mean) + CENTER);

  const rows: WilsonRow[] = teams.map((team) => {
    const i = index.get(team.name)!;
    const played = opp[i].length;
    return {
      name: team.name,
      slug: team.slug,
      classification: team.classification,
      region: team.region,
      wins: w[i],
      losses: l[i],
      ties: t[i],
      games: played,
      rating: show(next[i]),
      opp_rating: played
        ? show(opp[i].reduce((a, j) => a + next[j], 0) / played)
        : CENTER,
      rank: 0,
      class_rank: 0,
    };
  });

  rows.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    r.rank = i + 1;
    const c = (seen.get(r.classification) ?? 0) + 1;
    seen.set(r.classification, c);
    r.class_rank = c;
  });
  return rows;
}
