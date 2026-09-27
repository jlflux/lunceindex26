/**
 * The AHSAA football tie-breaking procedure, (a) through (q).
 *
 * Two things about the published rule shape the code, and both of them make it
 * something other than a sort.
 *
 * It resolves ONE PLACE AT A TIME. "Until the highest-ranked team has been
 * determined, no consideration will be given to determining the ranking of the
 * other teams involved in that tie." So the procedure picks a winner out of
 * the tied group, removes it, and starts again from the top of the list for
 * whoever is left — which is why the entry point is `pickHighest` and not a
 * comparator. A comparator would also be unsound: "did A beat B" is not
 * transitive, so the answer would depend on the order the array arrived in.
 *
 * Each factor NARROWS rather than orders. A factor names "the team (or teams)"
 * that lead on it; if that is one team it is the highest, and if it is more
 * than one the procedure restarts among just those — "then, if necessary,
 * apply (a) or (b) as applicable for the remaining teams in the tie". Every
 * factor below therefore returns a subset, or null when it does not apply, and
 * `pickHighest` handles the rest.
 *
 * Factors (c) through (j) compare records against the No. 1 through No. 8
 * ranked teams in the region. That is circular when the tie is for one of
 * those places, and the rule acknowledges it in one case: a three-way tie for
 * first skips to (f), the No. 4 team. That falls out here rather than being
 * special-cased — a place occupied by one of the tied teams is a factor that
 * "does not apply", so a three-way tie for first skips (c), (d) and (e) on its
 * own and lands on (f). Reproducing the published exception without being told
 * to is the best evidence available that the reading is right.
 *
 * Two departures, both deliberate:
 *
 *  - (q) is a coin flip administered by the association. There is no coin
 *    here, so the Index rating stands in for it. A board that reshuffled a tie
 *    on every publish would be worse than one that picks a side and stays.
 *  - Rule 7 excludes teams not eligible for championship play, and says
 *    out-of-state teams count when their association is an NFHS member. Which
 *    outside schools qualify is not something this data knows, so factors (k)
 *    through (p) count roster opponents only. That is the conservative
 *    reading; it can only under-count, and it never reaches a wrong team.
 */
import type { Record2 } from "./season";

/** One result, from the point of view of the team being scored. */
export interface TieGame {
  opponent: string;
  won: boolean;
  /** A region game — the association's "required" contest. */
  required: boolean;
}

export interface TieContext {
  /** Did `a` beat `b` in their required game. */
  beat(a: string, b: string): boolean;
  /** Did they play a required game at all. */
  metRequired(a: string, b: string): boolean;
  /**
   * The team standing in `place` in this region, 1-based, as far as the
   * standings are resolved. Null when the region is smaller than that.
   */
  teamAtPlace(place: number): string | null;
  /** Every game a team has played. Used by the later factors only. */
  results(team: string): TieGame[];
  /** A team's total victories, for the "defeated opponents" factors. */
  victories(team: string): number;
  /** Position in the classification ladder; null for a school off the roster. */
  classOrder(team: string): number | null;
  /** Deterministic stand-in for (q), the coin flip. */
  rating(team: string): number;
}

/**
 * A factor. Returns the teams that lead on it, or null when it does not apply
 * to this tie — which includes the case where it fails to separate anybody.
 */
export interface TieRule {
  key: string;
  label: string;
  apply(tied: string[], ctx: TieContext): string[] | null;
}

/** Keeps the leaders only when they are fewer than what went in. */
function narrow(tied: string[], leaders: string[]): string[] | null {
  return leaders.length && leaders.length < tied.length ? leaders : null;
}

/** The subset with the highest score, or null when a score is missing. */
function best(
  tied: string[],
  score: (team: string) => number | null,
): string[] | null {
  const scored: { t: string; s: number }[] = [];
  for (const t of tied) {
    const s = score(t);
    // A factor that cannot be computed for every tied team does not apply.
    if (s === null) return null;
    scored.push({ t, s });
  }
  const top = Math.max(...scored.map((x) => x.s));
  return narrow(
    tied,
    scored.filter((x) => x.s === top).map((x) => x.t),
  );
}

/**
 * (c) through (j): winning percentage against the No. `place` ranked team.
 *
 * Region opponents are played once, so the percentage is a win, a loss, or
 * nothing at all. A place held by one of the tied teams, or by nobody, is a
 * factor that does not apply.
 */
function versusRanked(place: number): TieRule {
  return {
    key: `vs${place}`,
    label: `record against the No. ${place} team in the region`,
    apply(tied, ctx) {
      const target = ctx.teamAtPlace(place);
      if (!target || tied.includes(target)) return null;
      return best(tied, (t) =>
        ctx.metRequired(t, target) ? (ctx.beat(t, target) ? 1 : 0) : null,
      );
    },
  };
}

/** Total games, for the factors that require every tied team to have played the same number. */
const gamesPlayed = (team: string, ctx: TieContext) => ctx.results(team).length;

function equalGames(tied: string[], ctx: TieContext): boolean {
  const n = gamesPlayed(tied[0], ctx);
  return tied.every((t) => gamesPlayed(t, ctx) === n);
}

/** Victories belonging to the opponents a team beat, under a filter. */
function defeatedOpponentWins(
  team: string,
  ctx: TieContext,
  keep: (g: TieGame) => boolean,
): number {
  let total = 0;
  for (const g of ctx.results(team)) {
    if (!g.won || !keep(g)) continue;
    // Off the roster: eligibility is unknowable here, so it is left out.
    if (ctx.classOrder(g.opponent) === null) continue;
    total += ctx.victories(g.opponent);
  }
  return total;
}

export const TIE_RULES: TieRule[] = [
  {
    // (a) two teams, and (b) more than two: the same question either way.
    key: "h2h",
    label: "head-to-head against the other tied teams",
    apply(tied, ctx) {
      const swept = tied.filter((t) =>
        tied.every((o) => o === t || ctx.beat(t, o)),
      );
      // "If one of the teams did not defeat all the other tied teams, the tie
      // cannot be resolved by this factor."
      return swept.length === 1 ? swept : null;
    },
  },
  versusRanked(1), // (c)
  versusRanked(2), // (d)
  versusRanked(3), // (e)
  versusRanked(4), // (f)
  versusRanked(5), // (g)
  versusRanked(6), // (h)
  versusRanked(7), // (i)
  versusRanked(8), // (j)
  {
    // (k)
    key: "common",
    label: "record against non-region common opponents",
    apply(tied, ctx) {
      const sets = tied.map(
        (t) =>
          new Set(
            ctx
              .results(t)
              .filter((g) => !g.required && ctx.classOrder(g.opponent) !== null)
              .map((g) => g.opponent),
          ),
      );
      const common = [...sets[0]].filter((o) => sets.every((s) => s.has(o)));
      if (!common.length) return null;
      const shared = new Set(common);
      return best(tied, (t) => {
        const games = ctx
          .results(t)
          .filter((g) => !g.required && shared.has(g.opponent));
        return games.length
          ? games.filter((g) => g.won).length / games.length
          : null;
      });
    },
  },
  {
    // (l)
    key: "nonRegionStrength",
    label:
      "victories of the non-region opponents it beat, at its own class or within two below",
    apply(tied, ctx) {
      if (!equalGames(tied, ctx)) return null;
      return best(tied, (t) => {
        const mine = ctx.classOrder(t);
        if (mine === null) return null;
        return defeatedOpponentWins(t, ctx, (g) => {
          if (g.required) return false;
          const theirs = ctx.classOrder(g.opponent);
          return theirs !== null && theirs >= mine - 2;
        });
      });
    },
  },
  {
    // (m)
    key: "defeatedWinsEqual",
    label: "victories of every opponent it beat, on an equal number of games",
    apply(tied, ctx) {
      if (!equalGames(tied, ctx)) return null;
      return best(tied, (t) => defeatedOpponentWins(t, ctx, () => true));
    },
  },
  {
    // (n)
    key: "defeatedWins",
    label: "victories of every opponent it beat",
    apply(tied, ctx) {
      return best(tied, (t) => defeatedOpponentWins(t, ctx, () => true));
    },
  },
  {
    // (o)
    key: "winsEqual",
    label: "total victories, on an equal number of games",
    apply(tied, ctx) {
      if (!equalGames(tied, ctx)) return null;
      return best(tied, (t) => ctx.victories(t));
    },
  },
  {
    // (p)
    key: "wins",
    label: "total victories",
    apply(tied, ctx) {
      return best(tied, (t) => ctx.victories(t));
    },
  },
];

/**
 * The highest-ranked team of a tied group.
 *
 * Factors are tried in order; the first that narrows the group either names
 * the winner outright or hands a smaller tie back to the top of the list.
 */
export function pickHighest(tied: string[], ctx: TieContext): string {
  if (tied.length === 1) return tied[0];
  for (const rule of TIE_RULES) {
    const leaders = rule.apply(tied, ctx);
    if (!leaders) continue;
    return leaders.length === 1 ? leaders[0] : pickHighest(leaders, ctx);
  }
  // (q). Everything the association would settle with a coin, settled the
  // same way every time instead.
  return [...tied].sort(
    (a, b) => ctx.rating(b) - ctx.rating(a) || a.localeCompare(b),
  )[0];
}

/**
 * Which factor separated the top of a tied group, for explaining a place.
 * Null when the group is not actually tied on record.
 */
export function decidingFactor(
  tied: string[],
  ctx: TieContext,
): string | null {
  if (tied.length < 2) return null;
  for (const rule of TIE_RULES) {
    if (rule.apply(tied, ctx)) return rule.label;
  }
  return "the Index rating, standing in for the coin flip";
}

/**
 * Region standing before any tiebreaker: win percentage, then wins.
 *
 * Percentage first is how a standings table reads — 1-0 leads 3-1 — with the
 * count breaking ties so 2-0 sits above 1-0. A team that has not opened region
 * play counts as neutral rather than as a loss, so mid-season it is not buried
 * beneath teams that have started and lost.
 */
function standingKey(r: Record2): [number, number] {
  const n = r.wins + r.losses + r.ties;
  // A tie is half a game won, not a game that never happened. Dividing by
  // wins-plus-losses alone would let a team with three of them reach .500 on
  // two wins while everyone else needed three and a half.
  return [n ? (r.wins + r.ties / 2) / n : 0.5, r.wins];
}

/**
 * Orders one region, best first.
 *
 * Places are settled from the top down, which is what the procedure requires:
 * the "No. N ranked team" a later factor asks about is only meaningful once
 * the places above the tie are decided.
 */
export function orderRegion(
  teams: string[],
  regionRecord: (team: string) => Record2,
  make: (teamAtPlace: (place: number) => string | null) => TieContext,
): string[] {
  if (teams.length < 2) return [...teams];

  // Hot path. This runs once per region per simulated season — half a million
  // times on a full slate — so it works on indices into plain arrays, and
  // bails out entirely when no two teams are level.
  const n = teams.length;
  const pct = new Float64Array(n);
  const wins = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = regionRecord(teams[i]);
    const played = r.wins + r.losses;
    pct[i] = played ? r.wins / played : 0.5;
    wins[i] = r.wins;
  }

  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => pct[b] - pct[a] || wins[b] - wins[a]);

  let anyTied = false;
  for (let i = 1; i < n && !anyTied; i++) {
    const a = order[i];
    const b = order[i - 1];
    anyTied = pct[a] === pct[b] && wins[a] === wins[b];
  }
  const byRecord = order.map((i) => teams[i]);
  if (!anyTied) return byRecord;

  // Resolved prefix, then whatever the record says about the rest. That is
  // what "the No. N ranked team" means while the standings are being built.
  const working = [...byRecord];
  const ctx = make((place) =>
    place >= 1 && place <= working.length ? working[place - 1] : null,
  );

  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (
      j < n &&
      pct[order[j]] === pct[order[i]] &&
      wins[order[j]] === wins[order[i]]
    ) {
      j++;
    }
    if (j - i > 1) {
      // Resolve this block in place, highest first, before moving down.
      let rest = working.slice(i, j);
      for (let slot = i; slot < j - 1; slot++) {
        const top = pickHighest(rest, ctx);
        working[slot] = top;
        rest = rest.filter((t) => t !== top);
      }
      working[j - 1] = rest[0];
    }
    i = j;
  }
  return working;
}
