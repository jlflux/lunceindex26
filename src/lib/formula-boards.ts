/**
 * The boards that are nothing but win-loss records: yours, your opponents',
 * and theirs.
 *
 *     value = wp × WP + owp × OWP + oowp × OOWP
 *
 * Every state association that seeds a bracket this way picks its own three
 * weights and its own rules about what a win is worth, and then publishes
 * them. So the arithmetic lives here once and the weights live in a table,
 * because the difference between two of these boards is data, not code.
 *
 * On this site they are reproductions of somebody else's published formula
 * rather than opinions of our own. That is the use of them: when one
 * disagrees with the Index, the disagreement is between two stated methods.
 * None of them feeds the Index, the bracket or the odds.
 *
 * The RPI board is not computed here. It is published into the ratings
 * snapshot by the engine and its row type is part of what is stored, so
 * folding it in would reach much further than these boards do. Its weights
 * are noted in the table below so the three can be read against each other
 * in one place.
 */
import { isPlayed, officialWinner } from "./result";
import type { Classification, Game } from "./types";

/**
 * What a win is worth, by where it was won and who it was against.
 *
 * Written out in full for every board rather than defaulted, because an
 * association that values a road win above a home one has said something
 * about its sport, and a board that silently inherited 1.0 from its
 * neighbour would hide that.
 */
export interface WinValue {
  home: number;
  away: number;
  neutral: number;
  /** A school outside the association: out-of-state, independent, AISA. */
  nonMember: number;
}

export interface FormulaSpec {
  key: string;
  /** As the column header and the nav say it. */
  label: string;
  weights: { wp: number; owp: number; oowp: number };
  winValue: WinValue;
}

/**
 * Georgia's Post Season Ranking, which the GHSA seeds its brackets 1–32 with.
 *
 * The 2026–27 appendix values home, away and neutral wins alike and discounts
 * only the win over a non-member school. The association has moved these
 * before — a road win has carried a premium in other years — so when it moves
 * them again, this is the line to change.
 */
export const PSR: FormulaSpec = {
  key: "psr",
  label: "PSR",
  weights: { wp: 0.35, owp: 0.35, oowp: 0.3 },
  winValue: { home: 1.0, away: 1.0, neutral: 1.0, nonMember: 0.9 },
};

/**
 * South Carolina's RPI, which the SCHSL seeds with.
 *
 * More weight on what you did and less on who you did it against than either
 * of the others. Where no win over a non-member school is involved — the one
 * input the two boards read differently — SCHSL reads exactly
 * 0.05 × (WP − OWP) above PSR, and that is the whole of the difference
 * between them.
 *
 * Every win is worth one. South Carolina's published weights are the three
 * here; its rules for out-of-state opponents are not reproduced because we do
 * not hold them, so a win is a win and the non-member game is kept out of the
 * strength terms in the way every board here keeps it out.
 */
export const SCHSL: FormulaSpec = {
  key: "schsl",
  label: "SCHSL",
  weights: { wp: 0.4, owp: 0.3, oowp: 0.3 },
  winValue: { home: 1.0, away: 1.0, neutral: 1.0, nonMember: 1.0 },
};

/** The boards the site serves, by the mode that selects them. */
export const FORMULA_BOARDS = { psr: PSR, schsl: SCHSL } as const;

/** What the Index's own RPI board uses, for reading the three together. */
export const RPI_WEIGHTS = { wp: 0.25, owp: 0.5, oowp: 0.25 } as const;

/** A tie is half a win to both sides. The formulas do not say; football rarely asks. */
const TIE_VALUE = 0.5;

/** All this needs of a team. `RatingRow` and `Team` both satisfy it. */
export interface FormulaTeam {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
}

export interface FormulaRow {
  name: string;
  slug: string;
  classification: Classification;
  region: number;
  wins: number;
  losses: number;
  ties: number;
  /** Wins counted at the board's values rather than one each. */
  weighted_wins: number;
  /** How many of those wins came against a school outside the association. */
  non_member_wins: number;
  /** Contests played — the denominator of WP. */
  games: number;
  win_pct: number;
  opp_win_pct: number;
  opp_opp_win_pct: number;
  /** The formula's figure for this team. */
  value: number;
  rank: number;
  class_rank: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Runs one formula over a field.
 *
 * Opponents outside the field count toward your own record — you played them,
 * and the win value is the only thing that marks it — but they contribute
 * nothing to the strength terms, because we hold no record for them. Georgia
 * states that rule for a non-member contest in as many words, and it happens
 * also to be the only honest thing to do with a school whose results are not
 * ours to read.
 */
export function rankBy(
  spec: FormulaSpec,
  teams: FormulaTeam[],
  games: Game[],
): FormulaRow[] {
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
    // The ruling, not the scoreboard: these boards are statements about a
    // record, and the association counts the forfeit. Same reading as RPI.
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
          r.value += g.neutral_site
            ? spec.winValue.neutral
            : side === "t1"
              ? spec.winValue.home
              : spec.winValue.away;
        } else {
          r.value += spec.winValue.nonMember;
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

  const rows: FormulaRow[] = teams.map((t) => {
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
      value:
        spec.weights.wp * a + spec.weights.owp * b + spec.weights.oowp * c,
      rank: 0,
      class_rank: 0,
    };
  });

  // Ties in the figure are broken by name, so a board is stable from one load
  // to the next rather than following whatever order the teams arrived in.
  rows.sort((x, y) => y.value - x.value || x.name.localeCompare(y.name));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    r.rank = i + 1;
    const n = (seen.get(r.classification) ?? 0) + 1;
    seen.set(r.classification, n);
    r.class_rank = n;
  });
  return rows;
}
