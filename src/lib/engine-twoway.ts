/**
 * The two-way rating engine: opponent-adjusted scoring offence and defence.
 *
 * The classic engine (engine.ts) solves ONE number per team out of margins.
 * This solves two — what you score and what you allow, each corrected for the
 * quality of the opposite unit you faced — and the rating is the difference:
 *
 *   points i scores on j  ≈  μ · exp(o_i) · exp(d_j) · exp(site)
 *
 *   AdjO_i = μ·exp(o_i)   points i would score on an average AHSAA defence
 *   AdjD_i = μ·exp(d_i)   points i would allow to an average AHSAA offence
 *   rating = AdjO_i − AdjD_i
 *
 * Everything is multiplicative, in log space. An additive version of this was
 * tried first and had to be abandoned: it predicts NEGATIVE points for the
 * best defences, which is not a rounding problem but the model being wrong
 * about what a score is. A good defence holds you to a FRACTION of your usual
 * output rather than subtracting a fixed number from it.
 *
 * Solved figures pass through a scoring CEILING before being published, because
 * a multiplicative model is unbounded above and football is not. See
 * `applyCeiling`.
 *
 * Fitted and validated against the FULL 2025 season — 2,050 games, 387 teams —
 * by rating on the weeks before N and predicting week N. Over 1,097 held-out
 * games that scores 82.6% on winners with a margin calibration slope of 1.09,
 * and the board it produces correlates 0.983 with the 2025 board that actually
 * shipped. See scripts/validate-2025-season.ts, which asserts all of it —
 * including that the POINTS predictions calibrate, not only the margins. That
 * check was missing at first, and its absence is exactly how an adjusted
 * offence of 94 points a game reached the public site.
 */

import {
  type Classification,
  type Game,
  type RatingRow,
  type Team,
  type TwoWayConfig,
} from "./types";
import { computeRpi, isPlayed } from "./engine";

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/**
 * The scoring ceiling.
 *
 * Identity up to `from`, then bending over to approach `ceiling` and never
 * reaching it. A multiplicative model is unbounded above and football is not,
 * so without this the best offence in the state reads as 94 points a game.
 *
 * Applied to the solved figures rather than inside the solve: that is the
 * form the 2025 season validates, and it leaves the ranking essentially
 * intact while making the published numbers mean what they say.
 */
export function applyCeiling(x: number, from: number, ceiling: number): number {
  if (!(ceiling > from) || x <= from) return x;
  return from + (ceiling - from) * (1 - Math.exp(-(x - from) / (ceiling - from)));
}

/** The pooled out-of-state opponent. Leading space cannot collide with a school. */
const OOS = " out-of-state";

/**
 * Playing-strength tier of a classification.
 *
 * Handles the 2026 labels (A and AA alongside 1A-6A) and 2025's plain 1A-7A.
 * A and AA are not below 1A: the private bracket is a separate system, not two
 * more rungs beneath the public ladder, so they sit where those schools
 * actually play.
 */
export function tierOf(c: Classification | string): number {
  if (c === "A") return 2.5;
  if (c === "AA") return 4.5;
  const m = /^(\d)A$/.exec(String(c));
  return m ? Number(m[1]) : 1;
}

export interface TwoWayResult {
  ratings: RatingRow[];
  rpi: ReturnType<typeof computeRpi>;
  maxWeekPlayed: number;
  priorBlend: number;
  /** League average points per team per game, the unit everything is in. */
  mu: number;
  /** The solved out-of-state pool. */
  oosO: number;
  oosD: number;
}

export function computeTwoWay(
  teams: Team[],
  games: Game[],
  cfg: TwoWayConfig,
): TwoWayResult {
  const played = games.filter(isPlayed).map((g) => ({
    ...g,
    s1: Number(g.s1),
    s2: Number(g.s2),
  }));

  const known = new Set(teams.map((t) => t.name));
  const nameOf = (n: string) => (known.has(n) ? n : OOS);
  const allPts = played.flatMap((g) => [g.s1, g.s2]);
  const mu = allPts.length ? mean(allPts) : 21;
  const maxWeekPlayed = played.reduce((m, g) => Math.max(m, g.week ?? 0), 0);

  interface Side {
    team: string;
    opp: string;
    pf: number;
    site: number;
    w: number;
  }
  const sides: Side[] = [];
  for (const g of played) {
    const w = Math.pow(cfg.recency, maxWeekPlayed - (g.week ?? 0));
    // A neutral game carries no site information. The 2025 export is recorded
    // winner-first rather than home-first, so every one of its games is
    // neutral — treating t1 as the home side there would teach the model a
    // home advantage equal to the winner's entire margin.
    const s = g.neutral_site ? 0 : 1;
    sides.push({ team: nameOf(g.t1), opp: nameOf(g.t2), pf: g.s1, site: +s, w });
    sides.push({ team: nameOf(g.t2), opp: nameOf(g.t1), pf: g.s2, site: -s, w });
  }

  const scoredBy = new Map<string, Side[]>();
  const concededBy = new Map<string, Side[]>();
  for (const t of teams) {
    scoredBy.set(t.name, []);
    concededBy.set(t.name, []);
  }
  scoredBy.set(OOS, []);
  concededBy.set(OOS, []);
  for (const s of sides) {
    scoredBy.get(s.team)?.push(s);
    concededBy.get(s.opp)?.push(s);
  }

  // ---- the prior ----------------------------------------------------------
  //
  // A team with a carry-over rating uses it; that rating already reflects
  // classification. A team without one falls back to its class baseline.
  //
  // The class baseline is load-bearing and its absence is not subtle. AHSAA
  // schedules are almost entirely within-classification, so the result graph
  // barely connects 1A to 6A — with no baseline there is nothing to stop a
  // team that went 14-0 against weak opposition floating to the top. Rebuilt
  // without it, 2025 put a 14-0 1A school 5th overall and a 3A school 12th,
  // against 34th and 65th on the board that shipped.
  const raw = teams
    .map((t) => t.preseason_prior)
    .filter((p): p is number => p !== null && p !== undefined);
  const rawMean = raw.length ? mean(raw) : 0;
  const tiers = teams.map((t) => tierOf(t.classification));
  const loT = Math.min(...tiers);
  const hiT = Math.max(...tiers);

  // Net margin → a symmetric pair of log multipliers, exactly: a team expected
  // to beat the average side by N is seeded perfectly balanced with net N,
  // since N = 2μ·sinh(n/2). Seeding by halving N in POINTS is what let the
  // prior assert a −33-point defence in an earlier draft.
  const priorNetLog = new Map<string, number>();
  for (const t of teams) {
    const net =
      t.preseason_prior !== null && t.preseason_prior !== undefined
        ? (t.preseason_prior - rawMean) * cfg.prior_scale
        : hiT > loT
          ? ((tierOf(t.classification) - loT) / (hiT - loT) - 0.5) *
            cfg.class_spread
          : 0;
    priorNetLog.set(t.name, 2 * Math.asinh(net / (2 * mu)));
  }
  priorNetLog.set(OOS, 0);

  const o = new Map<string, number>();
  const d = new Map<string, number>();
  for (const k of scoredBy.keys()) {
    const n = priorNetLog.get(k) ?? 0;
    o.set(k, n / 2);
    d.set(k, -n / 2);
  }

  const siteMul = (s: number) => Math.exp((s * cfg.hfa) / (2 * mu));

  // ---- solve --------------------------------------------------------------
  // Jacobi: every update reads the previous sweep, so the answer cannot depend
  // on the order teams happen to sit in.
  for (let it = 0; it < cfg.iters; it++) {
    const nO = new Map<string, number>();
    const nD = new Map<string, number>();
    for (const team of scoredBy.keys()) {
      const pn = priorNetLog.get(team) ?? 0;

      // Offence: points actually scored, over what an average offence would
      // have scored against those same defences. λ pseudo-games held at the
      // prior rate, which is also what stops a shut-out team taking log(0).
      let num = cfg.lambda * mu * Math.exp(pn / 2);
      let den = cfg.lambda * mu;
      let gw = 0;
      for (const s of scoredBy.get(team) as Side[]) {
        num += s.w * s.pf;
        den += s.w * mu * Math.exp(d.get(s.opp) ?? 0) * siteMul(s.site);
        gw += s.w;
      }
      const rawO = Math.log(Math.max(num, 1e-6) / Math.max(den, 1e-6));

      let dnum = cfg.lambda * mu * Math.exp(-pn / 2);
      let dden = cfg.lambda * mu;
      for (const s of concededBy.get(team) as Side[]) {
        dnum += s.w * s.pf;
        dden += s.w * mu * Math.exp(o.get(s.team) ?? 0) * siteMul(s.site);
      }
      const rawD = Math.log(Math.max(dnum, 1e-6) / Math.max(dden, 1e-6));

      // The level keeps what the data said; the SPLIT is pulled toward
      // balanced, and much harder. Split-half reliability over 275 teams puts
      // net (AdjO − AdjD) at r = 0.36 but the split (AdjO + AdjD) at only
      // r = 0.16: margins tell you how good a team is, and much less about
      // whether that comes from the offence or the defence. Leaving the split
      // free let one 56-point night against a good defence carry a team to
      // second overall.
      const net = rawO - rawD;
      const bal =
        gw + cfg.split_lambda > 0
          ? (rawO + rawD) * (gw / (gw + cfg.split_lambda))
          : rawO + rawD;
      nO.set(team, (net + bal) / 2);
      nD.set(team, (bal - net) / 2);
    }
    for (const [k, v] of nO) o.set(k, v);
    for (const [k, v] of nD) d.set(k, v);
  }

  const cap = (x: number) => applyCeiling(x, cfg.ceiling_from, cfg.ceiling);
  const adjO = (n: string) => cap(mu * Math.exp(o.get(n) ?? 0));
  const adjD = (n: string) => cap(mu * Math.exp(d.get(n) ?? 0));
  const netOf = (n: string) => adjO(n) - adjD(n);

  // ---- record, scoring, schedule -----------------------------------------
  interface Acc { w: number; l: number; g: number; pf: number; pa: number; opps: string[] }
  const acc = new Map<string, Acc>();
  for (const t of teams) acc.set(t.name, { w: 0, l: 0, g: 0, pf: 0, pa: 0, opps: [] });
  for (const g of played) {
    for (const [t, opp, pf, pa] of [
      [g.t1, g.t2, g.s1, g.s2],
      [g.t2, g.t1, g.s2, g.s1],
    ] as [string, string, number, number][]) {
      const a = acc.get(t);
      if (!a) continue;
      a.g++;
      a.pf += pf;
      a.pa += pa;
      a.opps.push(opp);
      if (pf > pa) a.w++;
      else if (pf < pa) a.l++;
    }
  }

  const rows: RatingRow[] = teams.map((t) => {
    const a = acc.get(t.name) as Acc;
    return {
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      wins: a.w,
      losses: a.l,
      rating: netOf(t.name),
      massey: netOf(t.name),
      sos: a.g ? mean(a.opps.map((n) => netOf(nameOf(n)))) : 0,
      o_eff: 0,
      d_eff: 0,
      adj_o: adjO(t.name),
      adj_d: adjD(t.name),
      sor: 0,
      ppg: a.g ? a.pf / a.g : 0,
      papg: a.g ? a.pa / a.g : 0,
      prior_blend: 0,
      rank: 0,
      class_rank: 0,
    };
  });

  rows.sort((x, y) => y.rating - x.rating);
  rows.forEach((r, i) => (r.rank = i + 1));

  attachStrengthOfRecord(rows, played, nameOf, netOf, cfg);

  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.classification) ?? 0) + 1;
    seen.set(r.classification, n);
    r.class_rank = n;
  }

  return {
    ratings: rows,
    rpi: computeRpi(teams, played),
    maxWeekPlayed,
    priorBlend: 0,
    mu,
    oosO: adjO(OOS),
    oosD: adjD(OOS),
  };
}

/**
 * Strength of Record: your wins, minus the wins a benchmark top-ten team would
 * be expected to take from your exact schedule.
 *
 * Deliberately ignores margin. It answers "what have you earned" rather than
 * "how good are you", so beating a good team counts however narrowly and
 * losing to a bad one hurts however narrowly — which is the complement the
 * predictive rating cannot give on its own.
 *
 * The logistic scale is fitted out-of-sample and is well calibrated across the
 * range: predicted 19/35/50/66/81/93% against actual 26/33/48/69/88/90%.
 */
function attachStrengthOfRecord(
  rows: RatingRow[],
  played: (Game & { s1: number; s2: number })[],
  nameOf: (n: string) => string,
  netOf: (n: string) => number,
  cfg: TwoWayConfig,
) {
  if (!rows.length) return;
  const bench = rows[Math.min(cfg.sor_benchmark_rank, rows.length) - 1].rating;
  const p = (diff: number) => 1 / (1 + Math.exp(-diff / cfg.sor_scale));
  const tally = new Map<string, { wins: number; exp: number }>();
  for (const r of rows) tally.set(r.name, { wins: 0, exp: 0 });

  for (const g of played) {
    const neutral = g.neutral_site ? 0 : 1;
    for (const [me, opp, mine, theirs, site] of [
      [g.t1, g.t2, g.s1, g.s2, +neutral],
      [g.t2, g.t1, g.s2, g.s1, -neutral],
    ] as [string, string, number, number, number][]) {
      const e = tally.get(me);
      if (!e) continue;
      if (mine > theirs) e.wins++;
      e.exp += p(bench - netOf(nameOf(opp)) + site * cfg.hfa);
    }
  }
  for (const r of rows) {
    const e = tally.get(r.name);
    r.sor = e ? e.wins - e.exp : 0;
  }
}
