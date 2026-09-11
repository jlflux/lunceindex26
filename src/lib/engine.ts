/**
 * The ALPreps Index rating engine — a modified Massey solver.
 *
 * Pure math, no I/O. Ported from the original PHP `computeRatings()`.
 *
 * Read `PROJECT.md` before changing anything here. Two things in particular
 * look like they could be simplified and cannot be:
 *
 *  1. The prior is re-applied on EVERY iteration, not just used as a seed. It
 *     is a permanent regularizer holding teams toward their class baseline —
 *     it is what stops an undefeated 1A team floating above 6A playoff teams.
 *  2. A game counts the moment both scores exist. The `status` field is never
 *     consulted, so a full season schedule can be loaded in advance without
 *     null-vs-null games reading as 0-0 ties.
 */

import {
  CLS_MAX,
  CLS_TIER,
  DEFAULT_CONFIG,
  type Classification,
  type EngineConfig,
  type Game,
  type RatingRow,
  type RpiRow,
  type Team,
} from "./types";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Step 0's predicate. A game counts iff both scores are actually present. */
export function isPlayed(g: Game): boolean {
  return (
    g.s1 !== null &&
    g.s2 !== null &&
    (g.s1 as unknown) !== "" &&
    (g.s2 as unknown) !== "" &&
    Number.isFinite(Number(g.s1)) &&
    Number.isFinite(Number(g.s2))
  );
}

function playoffMultiplier(g: Game, cfg: EngineConfig): number {
  if (g.type !== "playoff" || !g.round) return 1;
  const key = `playoff_${g.round}` as keyof EngineConfig;
  const m = cfg[key];
  return typeof m === "number" ? m : 1;
}

/**
 * The classification baseline every team is pulled toward.
 *
 * Keyed on CLS_TIER, not CLS_ORDER: AA is seeded like 4A and A like 2A,
 * because the private/independent bracket is a separate system rather than
 * two more rungs below 1A. See the note on CLS_TIER.
 *
 * Float division throughout — integer division here silently flattens the
 * whole ladder.
 */
export function classPrior(
  classification: Classification,
  cfg: EngineConfig,
): number {
  const tier = CLS_TIER[classification] ?? 1;
  return (
    cfg.prior_min +
    ((tier - 1) / (CLS_MAX - 1)) * (cfg.prior_max - cfg.prior_min)
  );
}

export interface ComputeResult {
  ratings: RatingRow[];
  rpi: RpiRow[];
  maxWeekPlayed: number;
  priorBlend: number;
}

export function computeRatings(
  teams: Team[],
  games: Game[],
  config: Partial<EngineConfig> = {},
): ComputeResult {
  const cfg: EngineConfig = { ...DEFAULT_CONFIG, ...config };

  // ---- Step 0: filter to played games ------------------------------------
  const played = games.filter(isPlayed).map((g) => ({
    ...g,
    s1: Number(g.s1),
    s2: Number(g.s2),
  }));

  const byName = new Map<string, Team>();
  for (const t of teams) byName.set(t.name, t);

  // `maxWeekPlayed` counts PLAYED games only. If it counted scheduled games,
  // loading a full season would jump it to week 10 and erase the prior.
  const maxWeekPlayed = played.reduce((m, g) => Math.max(m, g.week ?? 0), 0);
  const priorBlend = Math.max(0, 1 - maxWeekPlayed / 4);

  // ---- Step 1: seed each team from a blended prior ------------------------
  const effPrior = new Map<string, number>();
  for (const t of teams) {
    const cp = classPrior(t.classification, cfg);
    const pp = t.preseason_prior;
    // No carry-over rating on file → the class baseline alone.
    effPrior.set(
      t.name,
      pp === null || pp === undefined
        ? cp
        : priorBlend * pp + (1 - priorBlend) * cp,
    );
  }

  // Per-team record and scoring, plus the opponents actually faced.
  interface Acc {
    wins: number;
    losses: number;
    pf: number;
    pa: number;
    games: number;
    /** Opponent names, including out-of-state schools not in `teams`. */
    opponents: string[];
  }
  const acc = new Map<string, Acc>();
  const blank = (): Acc => ({
    wins: 0,
    losses: 0,
    pf: 0,
    pa: 0,
    games: 0,
    opponents: [],
  });
  for (const t of teams) acc.set(t.name, blank());

  // What each team did against each individual opponent, so a team can be
  // taken back out of that opponent's averages later. Keyed "team|opponent".
  const headToHead = new Map<string, { pf: number; pa: number; games: number }>();
  const h2hAdd = (t: string, o: string, pf: number, pa: number) => {
    const k = `${t}|${o}`;
    const e = headToHead.get(k) ?? { pf: 0, pa: 0, games: 0 };
    e.pf += pf;
    e.pa += pa;
    e.games++;
    headToHead.set(k, e);
  };

  for (const g of played) {
    const home = acc.get(g.t1);
    const away = acc.get(g.t2);
    if (home) {
      home.games++;
      home.pf += g.s1;
      home.pa += g.s2;
      home.opponents.push(g.t2);
      if (g.s1 > g.s2) home.wins++;
      else if (g.s1 < g.s2) home.losses++;
    }
    if (away) {
      away.games++;
      away.pf += g.s2;
      away.pa += g.s1;
      away.opponents.push(g.t1);
      if (g.s2 > g.s1) away.wins++;
      else if (g.s2 < g.s1) away.losses++;
    }
    h2hAdd(g.t1, g.t2, g.s1, g.s2);
    h2hAdd(g.t2, g.t1, g.s2, g.s1);
  }

  // How tightly the carry-over binds during the solve. `priorBlend` runs from
  // 1 in week 0 to 0 by week four, so this starts high and relaxes to the
  // steady-state `prior_w` — with early_anchor at 0 it IS prior_w throughout,
  // which is the behavior every earlier season was rated under.
  const anchoredPriorW =
    cfg.prior_w + (1 - cfg.prior_w) * priorBlend * (cfg.early_anchor ?? 0);

  // ---- Step 2: Massey iteration ------------------------------------------
  const rating = new Map<string, number>();
  for (const t of teams) rating.set(t.name, effPrior.get(t.name) as number);

  // Out-of-state schools have no rating of their own, so they are treated as
  // one shared opponent and SOLVED like a team rather than fixed at a guess.
  //
  // The old behavior pinned every non-AHSAA opponent at `meanRating *
  // oos_mult` for the whole season. That is a decree about a pool we can
  // actually measure: 27 games in 2026 through week two, with the AHSAA side
  // 11-16 and losing the losses badly. A constant set from the field mean
  // makes every one of those results say the same thing regardless of what
  // happened, and it lands hardest on the teams that schedule out of state —
  // Clay-Chalkville's win at Creekside GA read as a win over the 200th team
  // in Alabama.
  //
  // One pooled rating, not one per school: an out-of-state opponent almost
  // always plays a single AHSAA game, so an individual rating would just be
  // that team's own rating reflected back at them. Pooling all 27 gives the
  // level of the pool real support while staying honest that we cannot tell
  // Creekside from anyone else in it.
  //
  // `oos_mult` survives as the pool's PRIOR rather than its value: the same
  // anchoring every team gets, so a thin early sample cannot run away with it.
  //
  // Fixed once from the SEEDED field, exactly like every team's `effPrior`,
  // and deliberately not recomputed from the evolving ratings each pass.
  // Recomputing it couples the pool to the field it is being measured
  // against, and the coupling runs the wrong way: a pool that loses every
  // game raises the ratings of the teams that beat it, which raises the mean,
  // which raises the pool. Early in a season the prior carries most of the
  // weight, so that feedback wins outright — it rated a pool that lost
  // everything ABOVE one that won everything.
  const oosPrior = mean([...rating.values()]) * cfg.oos_mult;
  let oosRating = oosPrior;

  for (let iter = 0; iter < cfg.iters; iter++) {
    const ratingOf = (name: string) => rating.get(name) ?? oosRating;

    const bucket = new Map<string, number[]>();
    for (const t of teams) bucket.set(t.name, []);
    const oosBucket: number[] = [];

    for (const g of played) {
      const mult = playoffMultiplier(g, cfg);
      const margin = clamp(g.s1 - g.s2, -cfg.cap, cfg.cap) * mult;

      const homeBucket = bucket.get(g.t1);
      if (homeBucket) homeBucket.push(ratingOf(g.t2) + margin);
      else oosBucket.push(ratingOf(g.t2) + margin);

      const awayBucket = bucket.get(g.t2);
      if (awayBucket) awayBucket.push(ratingOf(g.t1) - margin);
      else oosBucket.push(ratingOf(g.t1) - margin);
    }

    const next = new Map<string, number>();
    for (const t of teams) {
      const b = bucket.get(t.name) as number[];
      const prior = effPrior.get(t.name) as number;
      // Teams with nothing played simply hold their prior.
      next.set(
        t.name,
        b.length ? anchoredPriorW * prior + (1 - anchoredPriorW) * mean(b) : prior,
      );
    }
    for (const [k, v] of next) rating.set(k, v);
    oosRating = oosBucket.length
      ? anchoredPriorW * oosPrior + (1 - anchoredPriorW) * mean(oosBucket)
      : oosPrior;
  }

  // ---- Step 3: head-to-head correction (single pass) ---------------------
  // If a winner still rates below a team it beat, nudge it up.
  for (const g of played) {
    const winner = g.s1 > g.s2 ? g.t1 : g.s2 > g.s1 ? g.t2 : null;
    if (!winner) continue; // ties leave the ladder alone
    const loser = winner === g.t1 ? g.t2 : g.t1;
    if (!rating.has(winner) || !rating.has(loser)) continue;

    const wr = rating.get(winner) as number;
    const lr = rating.get(loser) as number;
    if (wr < lr) {
      rating.set(
        winner,
        wr + Math.min(cfg.h2h_boost, (lr - wr) * cfg.h2h_frac) * 0.5,
      );
    }
  }

  const massey = new Map<string, number>(rating);

  // ---- Step 4: SOS and efficiency ----------------------------------------
  // The solved pool rating, so SOS prices an out-of-state opponent the same
  // way the solve did rather than falling back on the multiplier.
  const ratingOfFinal = (n: string) => massey.get(n) ?? oosRating;

  const ppgOf = new Map<string, number>();
  const papgOf = new Map<string, number>();
  for (const t of teams) {
    const a = acc.get(t.name) as Acc;
    ppgOf.set(t.name, a.games ? a.pf / a.games : 0);
    papgOf.set(t.name, a.games ? a.pa / a.games : 0);
  }

  const sosOf = new Map<string, number>();
  const oEffOf = new Map<string, number>();
  const dEffOf = new Map<string, number>();

  for (const t of teams) {
    const a = acc.get(t.name) as Acc;
    if (!a.games) {
      sosOf.set(t.name, 0);
      oEffOf.set(t.name, 0);
      dEffOf.set(t.name, 0);
      continue;
    }

    // Schedule strength, with the single weakest opponent dropped.
    //
    // The Massey solve has already charged you for that opponent — beating a
    // bad team by 60 earns you `theirRating + cap`, which pulls a good team
    // down. A plain mean here then charges you a second time, because adding a
    // weak name to the list lowers the mean and the composite pays 0.6 a
    // point for it. Every schedule in the state has a cupcake on it, so
    // reading one as evidence of a soft slate is noise, not signal.
    //
    // Dropping exactly one is deliberately self-limiting: at three games it
    // removes a third of the distortion, by week ten a tenth, which is the
    // right shape — a mean of ten opponents barely needs the help. Fitted and
    // checked at three games; there is no 2026 data yet to tune it deeper into
    // the season, and no knob for it because there is nothing to tune against.
    const oppR = a.opponents.map(ratingOfFinal).sort((x, y) => x - y);
    sosOf.set(t.name, mean(oppR.length >= 3 ? oppR.slice(1) : oppR));

    // How much better than expected you scored / defended, where "expected"
    // is what your opponents give up and score AGAINST EVERYONE ELSE.
    //
    // Your own game is taken back out of that baseline. Leaving it in compares
    // you partly against yourself: with one common opponent the two terms
    // cancel by half, and the figure reported is really half the gap between
    // you and whoever else played them. An opponent who has faced nobody but
    // you leaves no baseline at all, so they are skipped rather than counted
    // as zero.
    const oppPapg: number[] = [];
    const oppPpg: number[] = [];
    for (const o of new Set(a.opponents)) {
      const oa = acc.get(o);
      if (!oa) continue; // out-of-state: no record of their other games
      const h = headToHead.get(`${t.name}|${o}`);
      const others = oa.games - (h?.games ?? 0);
      if (others <= 0) continue;
      oppPapg.push((oa.pa - (h?.pf ?? 0)) / others);
      oppPpg.push((oa.pf - (h?.pa ?? 0)) / others);
    }
    const ownPpg = ppgOf.get(t.name) as number;
    const ownPapg = papgOf.get(t.name) as number;
    oEffOf.set(t.name, oppPapg.length ? ownPpg - mean(oppPapg) : 0);
    dEffOf.set(t.name, oppPpg.length ? mean(oppPpg) - ownPapg : 0);
  }

  // Median across teams that have actually played — zero-SOS teams would drag
  // the median down and shift every adjustment.
  const medianSos = median(
    [...sosOf.values()].filter((v) => v > 0),
  );

  // ---- Step 5: composite --------------------------------------------------
  const rows: RatingRow[] = teams.map((t) => {
    const a = acc.get(t.name) as Acc;
    const m = massey.get(t.name) as number;
    const sos = sosOf.get(t.name) as number;
    const oEff = oEffOf.get(t.name) as number;
    const dEff = dEffOf.get(t.name) as number;
    const winRate = a.games ? a.wins / a.games : 0.5; // neutral when unplayed

    // Dampens efficiency credit on a weak schedule — you don't get full marks
    // for outscoring bad opponents. A negative SOS scales to zero, so those
    // teams get no efficiency credit at all.
    const scale = medianSos > 0 ? clamp(sos / medianSos, 0, 1) : 0;

    // A one-game SOS is not a schedule, it is a single opponent's rating.
    // Across a finished season SOS is a mean of ten or more and sits in a
    // band of roughly -5 to +20; after one game it spans the entire rating
    // range, so the season-calibrated weight applied to it can swamp
    // everything else — enough to raise a team's rating for losing badly.
    // Ramps to full strength once a real schedule exists, which is why teams
    // in the 2025 set (all of whom played 7+) are untouched.
    const sosWeight = clamp(a.games / cfg.sos_ramp, 0, 1);

    let composite = m;
    // Gated on having played, NOT on sos > 0. SOS is a mean opponent rating
    // and is legitimately negative for a team on a genuinely weak schedule —
    // those teams must still take the adjustment. Gating on sos > 0 silently
    // exempted 61 of 387 teams in 2025 and broke the composite.
    if (a.games > 0) composite += (sos - medianSos) * cfg.sos_w * sosWeight;
    composite += (oEff + dEff) * cfg.eff_w * scale;
    composite += (winRate - 0.5) * cfg.wr_w;

    return {
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      wins: a.wins,
      losses: a.losses,
      rating: composite,
      massey: m,
      sos,
      o_eff: oEff,
      d_eff: dEff,
      ppg: ppgOf.get(t.name) as number,
      papg: papgOf.get(t.name) as number,
      prior_blend: priorBlend,
      rank: 0,
      class_rank: 0,
    };
  });

  rows.sort((a, b) => b.rating - a.rating);
  rows.forEach((r, i) => (r.rank = i + 1));
  assignClassRanks(rows);

  return {
    ratings: rows,
    rpi: computeRpi(teams, played),
    maxWeekPlayed,
    priorBlend,
  };
}

function assignClassRanks(rows: { classification: string; class_rank: number }[]) {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.classification) ?? 0) + 1;
    seen.set(r.classification, n);
    r.class_rank = n;
  }
}

/**
 * RPI = 25% Win% + 50% Opponents' Win% + 25% Opponents' Opponents' Win%.
 *
 * Out-of-state opponents count toward a team's own record but are excluded
 * from opponent-strength terms — we have no record for them.
 */
export function computeRpi(teams: Team[], gamesIn: Game[]): RpiRow[] {
  const played = gamesIn.filter(isPlayed).map((g) => ({
    ...g,
    s1: Number(g.s1),
    s2: Number(g.s2),
  }));

  const known = new Set(teams.map((t) => t.name));

  const rec = new Map<string, { w: number; l: number; opps: string[] }>();
  for (const t of teams) rec.set(t.name, { w: 0, l: 0, opps: [] });

  for (const g of played) {
    const h = rec.get(g.t1);
    const a = rec.get(g.t2);
    if (h) {
      if (g.s1 > g.s2) h.w++;
      else if (g.s1 < g.s2) h.l++;
      // Record counts every game; only in-state opponents feed strength.
      if (known.has(g.t2)) h.opps.push(g.t2);
    }
    if (a) {
      if (g.s2 > g.s1) a.w++;
      else if (g.s2 < g.s1) a.l++;
      if (known.has(g.t1)) a.opps.push(g.t1);
    }
  }

  const winPct = new Map<string, number>();
  for (const t of teams) {
    const r = rec.get(t.name)!;
    const n = r.w + r.l;
    winPct.set(t.name, n ? r.w / n : 0);
  }

  const oppWinPct = new Map<string, number>();
  for (const t of teams) {
    const r = rec.get(t.name)!;
    oppWinPct.set(
      t.name,
      r.opps.length ? mean(r.opps.map((o) => winPct.get(o) ?? 0)) : 0,
    );
  }

  const rows: RpiRow[] = teams.map((t) => {
    const r = rec.get(t.name)!;
    const wp = winPct.get(t.name) as number;
    const owp = oppWinPct.get(t.name) as number;
    // OOWP: the average of each opponent's own opponents' win percentage.
    const oowp = r.opps.length
      ? mean(r.opps.map((o) => oppWinPct.get(o) ?? 0))
      : 0;

    return {
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      wins: r.w,
      losses: r.l,
      win_pct: wp,
      opp_win_pct: owp,
      opp_opp_win_pct: oowp,
      rpi: 0.25 * wp + 0.5 * owp + 0.25 * oowp,
      rank: 0,
      class_rank: 0,
    };
  });

  rows.sort((a, b) => b.rpi - a.rpi);
  rows.forEach((r, i) => (r.rank = i + 1));
  assignClassRanks(rows);
  return rows;
}

// ---- Prediction helpers ---------------------------------------------------

/** Projected margin from the home team's perspective. */
export function expectedMargin(
  homeRating: number,
  awayRating: number,
  cfg: EngineConfig,
  neutralSite = false,
): number {
  return homeRating - awayRating + (neutralSite ? 0 : cfg.hfa);
}

export type Performance =
  | "dominant"
  | "exceeded"
  | "as-expected"
  | "below";

/**
 * How a result compared with the projection, from `teamIsHome`'s perspective.
 * `actualMargin` and `expected` are both home-relative.
 */
export function classifyPerformance(
  actualMargin: number,
  expected: number,
  cfg: EngineConfig,
): Performance {
  const diff = actualMargin - expected;
  if (diff >= cfg.perf_dominant_band) return "dominant";
  if (diff > cfg.perf_expected_band) return "exceeded";
  if (diff >= -cfg.perf_expected_band) return "as-expected";
  return "below";
}
