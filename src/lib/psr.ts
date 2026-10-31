/**
 * PSR — the GHSA's Post Season Ranking formula, run on our field.
 *
 *     PSR = 0.35 × WP + 0.35 × OWP + 0.30 × OOWP
 *
 * Georgia seeds its brackets 1–32 with this. It is on this site because it
 * answers a different question from the Index: the Index asks how well a team
 * plays, PSR asks what its schedule says about it, and the two disagree in
 * ways worth looking at. Nothing here feeds the Index, the bracket or the
 * odds — it is a board of its own.
 *
 * It is a cousin of the RPI board next door, with three differences that are
 * the whole reason it is not just RPI with other weights:
 *
 *   1. The weights. RPI leans hardest on who you played (25/50/25); PSR
 *      splits its weight evenly between what you did and who you did it
 *      against (35/35/30).
 *   2. A win is not always worth one. A win over a school outside the
 *      association counts 0.9 — see `WIN_VALUE`.
 *   3. WP divides by contests played, so the 0.9 shows up as a shortfall
 *      rather than as a smaller schedule.
 *
 * Where the published formula is silent, this follows the RPI board already
 * here, and says so on the page rather than leaving a reader to guess:
 * opponents' win percentages are their own full win percentages, with no
 * head-to-head game removed, and a tie counts half a win to both sides.
 */
import { isPlayed, officialWinner } from "./result";
import type { Classification, Game } from "./types";

/**
 * What a win is worth.
 *
 * Georgia's 2026–27 appendix values home, away and neutral wins alike and
 * discounts only the non-member win. The three equal entries are written out
 * rather than collapsed because the association has moved them before — a
 * road win has carried a premium in other years — and when it moves them
 * again this is the one place to change.
 */
export const WIN_VALUE = {
  home: 1.0,
  away: 1.0,
  neutral: 1.0,
  /** A school outside the association: out-of-state, independent, AISA. */
  nonMember: 0.9,
} as const;

export const PSR_WEIGHTS = { wp: 0.35, owp: 0.35, oowp: 0.3 } as const;

/** A tie is half a win to both sides. The formula does not say; football rarely asks. */
const TIE_VALUE = 0.5;

/** All this needs of a team. `RatingRow` and `Team` both satisfy it. */
export interface PsrTeam {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
}

export interface PsrRow {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
  wins: number;
  losses: number;
  ties: number;
  /** Wins counted at their value: 1.0 each, 0.9 for a non-member. */
  weighted_wins: number;
  /** How many of those wins came against a school outside the association. */
  non_member_wins: number;
  /** Contests played — the denominator of WP. */
  games: number;
  win_pct: number;
  opp_win_pct: number;
  opp_opp_win_pct: number;
  psr: number;
  rank: number;
  class_rank: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Runs the formula over a field.
 *
 * Opponents outside the field count toward your own record — you played them,
 * and the 0.9 is the only thing that marks it — but they contribute nothing to
 * the strength terms, because we hold no record for them. That is Georgia's
 * own rule for a non-member contest ("calculated using winning percentage
 * only") and it happens also to be the only honest thing to do with a school
 * whose results we do not have.
 */
export function computePsr(teams: PsrTeam[], games: Game[]): PsrRow[] {
  const member = new Set(teams.map((t) => t.name));

  type Rec = {
    w: number; l: number; t: number;
    value: number; nonMemberWins: number; games: number;
    /** Member opponents only, repeated per meeting. */
    opps: string[];
  };
  const rec = new Map<string, Rec>();
  for (const t of teams)
    rec.set(t.name, { w: 0, l: 0, t: 0, value: 0, nonMemberWins: 0, games: 0, opps: [] });

  for (const g of games) {
    if (!isPlayed(g) && !g.forfeit_by) continue;
    // The ruling, not the scoreboard: PSR is a statement about a record, and
    // the association counts the forfeit. Same reading as the RPI board.
    const winner = officialWinner(g);

    for (const side of ["t1", "t2"] as const) {
      const me = side === "t1" ? g.t1 : g.t2;
      const them = side === "t1" ? g.t2 : g.t1;
      const r = rec.get(me);
      if (!r) continue;

      r.games++;
      const oppIsMember = member.has(them);
      if (oppIsMember) r.opps.push(them);

      if (winner === side) {
        r.w++;
        if (oppIsMember) {
          // Home, away and neutral are all worth the same today; read through
          // the table anyway, so a year that changes that changes only it.
          r.value += g.neutral_site
            ? WIN_VALUE.neutral
            : side === "t1"
              ? WIN_VALUE.home
              : WIN_VALUE.away;
        } else {
          r.value += WIN_VALUE.nonMember;
          r.nonMemberWins++;
        }
      } else if (winner === null) {
        r.t++;
        r.value += TIE_VALUE;
      } else {
        r.l++;
      }
    }
  }

  const wp = new Map<string, number>();
  for (const t of teams) {
    const r = rec.get(t.name)!;
    wp.set(t.name, r.games ? r.value / r.games : 0);
  }

  const owp = new Map<string, number>();
  for (const t of teams) {
    const r = rec.get(t.name)!;
    owp.set(t.name, r.opps.length ? mean(r.opps.map((o) => wp.get(o) ?? 0)) : 0);
  }

  const rows: PsrRow[] = teams.map((t) => {
    const r = rec.get(t.name)!;
    const a = wp.get(t.name)!;
    const b = owp.get(t.name)!;
    // OOWP: the average of each member opponent's OWP.
    const c = r.opps.length ? mean(r.opps.map((o) => owp.get(o) ?? 0)) : 0;
    return {
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      wins: r.w,
      losses: r.l,
      ties: r.t,
      weighted_wins: r.value,
      non_member_wins: r.nonMemberWins,
      games: r.games,
      win_pct: a,
      opp_win_pct: b,
      opp_opp_win_pct: c,
      psr: PSR_WEIGHTS.wp * a + PSR_WEIGHTS.owp * b + PSR_WEIGHTS.oowp * c,
      rank: 0,
      class_rank: 0,
    };
  });

  // Ties in PSR are broken by name, so the board is stable from one load to
  // the next rather than following whatever order the teams arrived in.
  rows.sort((x, y) => y.psr - x.psr || x.name.localeCompare(y.name));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    r.rank = i + 1;
    const n = (seen.get(r.classification) ?? 0) + 1;
    seen.set(r.classification, n);
    r.class_rank = n;
  });
  return rows;
}
